<?php
/**
 * Toss 결제 성공 redirect 핸들러.
 *
 * Toss → /api/payments/success.php?paymentKey=...&orderId=...&amount=...
 *
 * 흐름:
 *  1) pending order 파일 로드 (orderId 기반)
 *  2) Toss로 받은 amount === pending.expectedAmount 검증 (위변조 방어)
 *  3) Toss confirm API 호출 (시크릿 키 Basic auth)
 *  4) 결제 승인 성공 시:
 *     - party_counts atomic +1
 *     - 쿠폰 atomic consume
 *     - booking 생성 (status: 프로필 완성도에 따라 paid_pending_profile / pending_approval)
 *  5) /payment/success/?ids=...&total=... 로 redirect
 *
 * 실패: /checkout?error=... 로 redirect.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';   // priceForGender / calcCouponDiscount / countCouponUsages
require_once __DIR__ . '/../db.php';
header('Cache-Control: no-store, no-cache, must-revalidate');

$paymentKey = trim((string)($_GET['paymentKey'] ?? ''));
$orderId    = trim((string)($_GET['orderId']    ?? ''));
$amount     = (int)         ($_GET['amount']    ?? 0);

function redirectFail(string $msg): void {
    header('Location: https://thewoollim.com/checkout/?error=' . urlencode($msg));
    exit;
}

if ($paymentKey === '' || $orderId === '' || $amount <= 0) redirectFail('잘못된 결제 응답');
if (!preg_match('/^[A-Za-z0-9_\-]+$/', $orderId))           redirectFail('주문 식별자 오류');

$dataDir     = __DIR__ . '/../data';
$pendingFile = $dataDir . '/pending/' . $orderId . '.json';
if (!file_exists($pendingFile)) redirectFail('주문을 찾을 수 없습니다');
$pending = json_decode((string)file_get_contents($pendingFile), true);
if (!is_array($pending))                redirectFail('주문 데이터 손상');
if ((int)($pending['expiresAt'] ?? 0) < time()) { @unlink($pendingFile); redirectFail('주문이 만료되었습니다'); }
if ((int)$pending['expectedAmount'] !== $amount) {
    @file_put_contents($dataDir . '/_toss_amount_mismatch.log', sprintf(
        "[%s] orderId=%s expected=%d got=%d\n",
        date('c'), $orderId, $pending['expectedAmount'], $amount
    ), FILE_APPEND);
    redirectFail('결제 금액이 일치하지 않습니다');
}

// ── 멱등성(idempotency) 체크 — 같은 orderId 의 booking 이 이미 있으면 즉시 redirect.
//    브라우저 reload / Toss 재콜백 등으로 success.php 가 두 번 실행돼도 중복 처리 방지.
{
    $idemEmail    = (string)($pending['email'] ?? '');
    $idemPartyIds = is_array($pending['partyIds'] ?? null)
        ? array_values(array_unique(array_map('strval', $pending['partyIds'])))
        : [];
    $idemFile = $dataDir . '/bookings_' . md5(strtolower(trim($idemEmail))) . '.json';
    if ($idemEmail !== '' && file_exists($idemFile)) {
        $idemBookings = json_decode((string)file_get_contents($idemFile), true);
        if (is_array($idemBookings)) {
            foreach ($idemBookings as $eb) {
                if (is_array($eb) && (string)($eb['tossOrderId'] ?? '') === $orderId) {
                    @unlink($pendingFile);
                    @file_put_contents("$dataDir/_toss_success.log", sprintf(
                        "[%s] IDEMPOTENT_REDIRECT orderId=%s amount=%d email=%s\n",
                        date('c'), $orderId, $amount, $idemEmail
                    ), FILE_APPEND);
                    $ids = implode(',', $idemPartyIds);
                    header('Location: https://thewoollim.com/payment/success/?ids=' . urlencode($ids) . '&total=' . $amount);
                    exit;
                }
            }
        }
    }
}

// ── Toss confirm API 호출 (Basic auth: SECRET_KEY + ":" → Base64)
$cfg = require __DIR__ . '/toss-config.php';
if (empty($cfg['secret_key']) || !str_starts_with((string)$cfg['secret_key'], 'test_') && !str_starts_with((string)$cfg['secret_key'], 'live_')) {
    @file_put_contents($dataDir . '/_toss_failures.log', sprintf(
        "[%s] config fail — secret_key 형식 비정상\n", date('c')
    ), FILE_APPEND);
    redirectFail('결제 시스템 설정 오류 (관리자 문의)');
}

$confirmBody = json_encode([
    'paymentKey' => $paymentKey,
    'orderId'    => $orderId,
    'amount'     => $amount,
]);

$ch = curl_init($cfg['confirm_url']);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $confirmBody,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Basic ' . base64_encode($cfg['secret_key'] . ':'),
        'Content-Type: application/json',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT        => 20,
]);
$tossBody  = curl_exec($ch);
$tossHttp  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErrno = curl_errno($ch);
$curlErr   = curl_error($ch);
curl_close($ch);

// 네트워크 오류 — Toss 서버에 도달 못 함
if ($tossHttp === 0 || $curlErrno !== 0) {
    @file_put_contents($dataDir . '/_toss_failures.log', sprintf(
        "[%s] NETWORK orderId=%s curl_errno=%d curl_err=%s\n",
        date('c'), $orderId, $curlErrno, $curlErr
    ), FILE_APPEND);
    redirectFail('결제 서버 연결 실패 — 잠시 후 다시 시도해주세요');
}

// Toss 응답 파싱 — 에러 코드/메시지 추출
$tossJson    = is_string($tossBody) ? (json_decode($tossBody, true) ?: []) : [];
$tossCode    = isset($tossJson['code'])    ? (string)$tossJson['code']    : '';
$tossMessage = isset($tossJson['message']) ? (string)$tossJson['message'] : '';

// ALREADY_PROCESSED_PAYMENT — Toss 가 이미 결제를 확정한 상태.
// V2 widgets + docs sample keys 환경에서는 SDK 가 redirect 전 자동 확정 → 우리 confirm 호출 시
// 이 코드를 자주 반환. 위의 멱등성 체크에서 booking 미존재 확인됐으므로, 정상적으로 booking 생성.
$alreadyProcessed = ($tossHttp === 400 && $tossCode === 'ALREADY_PROCESSED_PAYMENT');
if ($tossHttp !== 200 && !$alreadyProcessed) {
    @file_put_contents($dataDir . '/_toss_failures.log', sprintf(
        "[%s] CONFIRM_FAIL orderId=%s http=%d code=%s msg=%s req=%s\n",
        date('c'), $orderId, $tossHttp, $tossCode, $tossMessage,
        $confirmBody
    ), FILE_APPEND);

    // 사용자에게 Toss 측 메시지 그대로 노출 (있으면)
    $userMsg = $tossMessage !== ''
        ? "결제 승인 실패 [{$tossCode}]: {$tossMessage}"
        : "결제 승인이 거절되었습니다 (HTTP {$tossHttp})";
    redirectFail($userMsg);
}
if ($alreadyProcessed) {
    @file_put_contents($dataDir . '/_toss_failures.log', sprintf(
        "[%s] ALREADY_PROCESSED orderId=%s — 정상 처리 진행 (booking 미존재)\n",
        date('c'), $orderId
    ), FILE_APPEND);
}

// ── booking 생성
$email     = $pending['email'];
$gender    = $pending['gender'];
$genderKey = $gender === '남성' ? 'male' : 'female';
$partyIds  = array_map('strval', $pending['partyIds']);
$couponCode    = (string)$pending['couponCode'];
$couponPartyId = (string)$pending['couponPartyId'];

// ── parties.json 로드 → partyMap (counts 검증 / 쿠폰 / booking row 모두에서 사용) ─
$partiesJson = file_exists("$dataDir/parties.json") ? json_decode(file_get_contents("$dataDir/parties.json"), true) : [];
$partyMap = [];
foreach ((array)$partiesJson as $p) {
    if (isset($p['id'])) $partyMap[(string)$p['id']] = $p;
}

$STOCK_PER_SIDE = 12;
$DEFAULT_COUNTS = [];

// 정원 검증 + 차감 (flock atomic)
// 회복력 강화: counts 파일 fopen 실패 시 결제는 이미 Toss 가 확정한 상태이므로,
// 결제 취소 대신 booking 만 생성하고 admin 수동 확인 큐에 기록 (사용자 중복 결제 방어).
$countsFile = "$dataDir/party_counts.json";
$fp = fopen($countsFile, 'c+');
$skipCounts = false;
$counts = [];
$effective = [];
if (!$fp) {
    // CRITICAL: 권한/디스크 등 이슈로 counts 파일 열기 실패.
    // 결제는 이미 Toss 확정 → 사용자에겐 성공 처리 + 관리자 알림 로그.
    $skipCounts = true;
    @file_put_contents("$dataDir/_counts_failure_alert.log", sprintf(
        "[%s] CRITICAL — fopen %s 실패. orderId=%s email=%s parties=%s — 인원 카운트 수동 보정 필요.\n",
        date('c'), $countsFile, $orderId, $email, implode(',', array_unique($partyIds))
    ), FILE_APPEND);
    error_log('[payments/success] CRITICAL counts fopen failed: ' . $countsFile);
} else {
    flock($fp, LOCK_EX);
    $raw = stream_get_contents($fp);
    $counts = $raw ? json_decode($raw, true) : [];
    if (!is_array($counts)) $counts = [];

    $reqCounts = [];
    foreach ($partyIds as $pid) $reqCounts[$pid] = ($reqCounts[$pid] ?? 0) + 1;

    $soldOut = [];
    foreach ($reqCounts as $pid => $reqQty) {
        // partyId 가 parties.json 에 실재하는지 추가 검증 (다중 ids 모두)
        if (!isset($partyMap[$pid])) {
            flock($fp, LOCK_UN); fclose($fp);
            @file_put_contents("$dataDir/_counts_failure_alert.log", sprintf(
                "[%s] INVALID_PARTY orderId=%s email=%s missing_partyId=%s\n",
                date('c'), $orderId, $email, $pid
            ), FILE_APPEND);
            redirectFail("파티를 찾을 수 없습니다: $pid");
        }
        $cur = $counts[$pid] ?? $DEFAULT_COUNTS[$pid] ?? ['male' => 0, 'female' => 0];
        $effective[$pid] = $cur;
        if ($cur[$genderKey] + $reqQty > $STOCK_PER_SIDE) $soldOut[] = $pid;
    }
    if (!empty($soldOut)) {
        flock($fp, LOCK_UN); fclose($fp);
        redirectFail('잔여 정원을 초과했습니다');
    }
}

// 쿠폰 atomic consume — 사용 이력 기록 + max_count 한도 enforce
$couponDiscount = 0;
if ($couponCode !== '') {
    $couponsFile = "$dataDir/coupons.json";
    $usagesFile  = "$dataDir/coupon_usages.json";
    $coupons = file_exists($couponsFile) ? json_decode(file_get_contents($couponsFile), true) : [];
    if (!is_array($coupons)) $coupons = [];
    $found = null;
    foreach ($coupons as $c) {
        if (strtoupper((string)($c['code'] ?? '')) === strtoupper($couponCode)) { $found = $c; break; }
    }
    if (!$found || empty($found['active']) ||
        (!empty($found['expiresAt']) && strtotime($found['expiresAt']) < strtotime(date('Y-m-d')))) {
        flock($fp, LOCK_UN); fclose($fp);
        redirectFail('쿠폰이 유효하지 않습니다');
    }
    // 쿠폰 적용 대상 파티의 단가 기준으로 할인 금액 계산
    // 쿠폰 대상 파티의 성별별 가격 기준 — pending.php 와 동일 규칙으로 amount 검증 일치 보장
    $linePrice      = priceForGender($partyMap[$couponPartyId], $gender);
    $couponDiscount = calcCouponDiscount($found, $linePrice);

    $cfp = fopen($usagesFile, 'c+');
    flock($cfp, LOCK_EX);
    $craw = stream_get_contents($cfp);
    $usages = $craw ? json_decode($craw, true) : [];
    if (!is_array($usages)) $usages = [];

    // 1) 동일 사용자 중복 사용 차단
    foreach ($usages as $u) {
        if (strtoupper((string)($u['code'] ?? '')) === strtoupper($couponCode) &&
            strtolower((string)($u['email'] ?? '')) === strtolower($email)) {
            flock($cfp, LOCK_UN); fclose($cfp);
            flock($fp, LOCK_UN);  fclose($fp);
            redirectFail('이미 사용한 쿠폰입니다');
        }
    }
    // 2) 총 발급 수량 한도 atomic enforce — 잠금 안에서 카운트 조회 후 비교
    $maxCount = max(0, (int)($found['max_count'] ?? 0));
    if ($maxCount > 0 && countCouponUsages($usages, $couponCode) >= $maxCount) {
        flock($cfp, LOCK_UN); fclose($cfp);
        flock($fp, LOCK_UN);  fclose($fp);
        redirectFail('쿠폰 발급 수량이 모두 소진되었습니다');
    }

    $usages[] = [
        'code'          => strtoupper($couponCode),
        'email'         => $email,
        'discount_type' => (string)($found['discount_type'] ?? 'amount'),
        'amount'        => (int)($found['amount'] ?? 0),
        'discount'      => $couponDiscount,
        'usedAt'        => date('c'),
    ];
    ftruncate($cfp, 0); rewind($cfp); fwrite($cfp, json_encode($usages, JSON_UNESCAPED_UNICODE));
    fflush($cfp); flock($cfp, LOCK_UN); fclose($cfp);
}

// 정원 증가 + 저장 — counts 파일 정상 열린 경우만 (skipCounts 시 booking 만 생성)
if (!$skipCounts && $fp) {
    foreach ($partyIds as $pid) {
        if (!isset($effective[$pid])) $effective[$pid] = ['male' => 0, 'female' => 0];
        $effective[$pid][$genderKey]++;
    }
    $merged = $counts;
    foreach ($effective as $pid => $c) $merged[$pid] = $c;
    ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($merged));
    fflush($fp); flock($fp, LOCK_UN); fclose($fp);
}

// booking row 생성 — partyMap 은 위에서 이미 로드됨

// 프로필 자동 분기
$profileComplete = false;
try {
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT name, gender, mbti, job FROM users WHERE LOWER(email) = LOWER(?) AND status = 'active' LIMIT 1");
    $stmt->execute([$email]);
    $u = $stmt->fetch();
    if ($u && trim((string)$u['name']) !== '' && trim((string)$u['gender']) !== ''
          && trim((string)$u['job']) !== '' && trim((string)$u['mbti']) !== '') {
        $profileComplete = true;
    }
} catch (Exception $e) {}
$initialStatus = $profileComplete ? 'pending_approval' : 'paid_pending_profile';

$bookingsFile = "$dataDir/bookings_" . md5(strtolower(trim($email))) . '.json';
$bookings = file_exists($bookingsFile) ? json_decode(file_get_contents($bookingsFile), true) : [];
if (!is_array($bookings)) $bookings = [];

$now = date('c');
$couponApplied = false;
foreach ($partyIds as $pid) {
    // 회원 성별 기반 가격 — pending.php 와 동일 규칙
    $partyPrice  = priceForGender($partyMap[$pid] ?? [], $gender);
    $isCouponHit = ($couponCode !== '' && $pid === $couponPartyId && !$couponApplied);
    $rowDiscount = $isCouponHit ? $couponDiscount : 0;
    if ($isCouponHit) $couponApplied = true;
    $rowTotal = max(0, $partyPrice - $rowDiscount);
    $bookings[] = [
        'id'          => bin2hex(random_bytes(8)),
        'partyId'     => $pid,
        'status'      => $initialStatus,
        'paymentId'   => $paymentKey,
        'tossOrderId' => $orderId,
        'total'       => $rowTotal,
        'gender'      => $gender,
        'couponCode'  => $isCouponHit ? strtoupper($couponCode) : null,
        'discount'    => $rowDiscount,
        'createdAt'   => $now,
        'updatedAt'   => $now,
    ];
}
file_put_contents($bookingsFile, json_encode($bookings, JSON_UNESCAPED_UNICODE));

// ── 결제된 partyId 만 카트에서 정밀 제거 (atomic, flock) ─────────────
//    혹시라도 결제하지 않은 다른 항목은 그대로 보존.
$paidPartyIds = array_values(array_unique($partyIds));
$cartFile     = $dataDir . '/cart_' . md5(strtolower(trim($email))) . '.json';
if (file_exists($cartFile) && !empty($paidPartyIds)) {
    $cfp = fopen($cartFile, 'c+');
    if ($cfp) {
        flock($cfp, LOCK_EX);
        $craw = stream_get_contents($cfp);
        $current = $craw ? json_decode($craw, true) : [];
        if (!is_array($current)) $current = [];

        $paidSet = array_flip(array_map('strval', $paidPartyIds));
        $kept    = [];
        $removed = 0;
        foreach ($current as $item) {
            if (!is_array($item)) continue;
            $pid = (string)($item['partyId'] ?? '');
            if ($pid !== '' && isset($paidSet[$pid])) { $removed++; continue; }
            $kept[] = $item;
        }

        ftruncate($cfp, 0); rewind($cfp);
        fwrite($cfp, json_encode($kept, JSON_UNESCAPED_UNICODE));
        fflush($cfp); flock($cfp, LOCK_UN); fclose($cfp);

        @file_put_contents("$dataDir/_cart_cleanup.log", sprintf(
            "[%s] orderId=%s email=%s removed=%d kept=%d paidIds=%s\n",
            date('c'), $orderId, $email, $removed, count($kept), implode(',', $paidPartyIds)
        ), FILE_APPEND);
    }
}

// pending 파일 정리
@unlink($pendingFile);

@file_put_contents("$dataDir/_toss_success.log", sprintf(
    "[%s] APPROVED orderId=%s amount=%d email=%s parties=%s\n",
    date('c'), $orderId, $amount, $email, implode(',', array_unique($partyIds))
), FILE_APPEND);

$ids = implode(',', array_unique($partyIds));
header('Location: https://thewoollim.com/payment/success/?ids=' . urlencode($ids) . '&total=' . $amount);
exit;
