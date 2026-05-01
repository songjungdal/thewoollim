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

// ── Toss confirm API 호출
$cfg = require __DIR__ . '/toss-config.php';
$ch = curl_init($cfg['confirm_url']);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode([
        'paymentKey' => $paymentKey,
        'orderId'    => $orderId,
        'amount'     => $amount,
    ]),
    CURLOPT_HTTPHEADER     => [
        'Authorization: Basic ' . base64_encode($cfg['secret_key'] . ':'),
        'Content-Type: application/json',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
]);
$tossBody = curl_exec($ch);
$tossHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($tossHttp !== 200) {
    @file_put_contents($dataDir . '/_toss_failures.log', sprintf(
        "[%s] confirm fail http=%d body=%s\n",
        date('c'), $tossHttp, substr((string)$tossBody, 0, 800)
    ), FILE_APPEND);
    redirectFail('결제 승인이 거절되었습니다');
}

// ── booking 생성
$email     = $pending['email'];
$gender    = $pending['gender'];
$genderKey = $gender === '남성' ? 'male' : 'female';
$partyIds  = array_map('strval', $pending['partyIds']);
$couponCode    = (string)$pending['couponCode'];
$couponPartyId = (string)$pending['couponPartyId'];

$STOCK_PER_SIDE = 12;
$DEFAULT_COUNTS = [];

// 정원 검증 + 차감 (flock atomic)
$countsFile = "$dataDir/party_counts.json";
$fp = fopen($countsFile, 'c+');
if (!$fp) redirectFail('서버 오류 (counts)');
flock($fp, LOCK_EX);
$raw = stream_get_contents($fp);
$counts = $raw ? json_decode($raw, true) : [];
if (!is_array($counts)) $counts = [];

$reqCounts = [];
foreach ($partyIds as $pid) $reqCounts[$pid] = ($reqCounts[$pid] ?? 0) + 1;

$soldOut = [];
$effective = [];
foreach ($reqCounts as $pid => $reqQty) {
    $cur = $counts[$pid] ?? $DEFAULT_COUNTS[$pid] ?? ['male' => 0, 'female' => 0];
    $effective[$pid] = $cur;
    if ($cur[$genderKey] + $reqQty > $STOCK_PER_SIDE) $soldOut[] = $pid;
}
if (!empty($soldOut)) {
    flock($fp, LOCK_UN); fclose($fp);
    redirectFail('잔여 정원을 초과했습니다');
}

// 쿠폰 atomic consume
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
    $cfp = fopen($usagesFile, 'c+');
    flock($cfp, LOCK_EX);
    $craw = stream_get_contents($cfp);
    $usages = $craw ? json_decode($craw, true) : [];
    if (!is_array($usages)) $usages = [];
    foreach ($usages as $u) {
        if (strtoupper((string)($u['code'] ?? '')) === strtoupper($couponCode) &&
            strtolower((string)($u['email'] ?? '')) === strtolower($email)) {
            flock($cfp, LOCK_UN); fclose($cfp);
            flock($fp, LOCK_UN);  fclose($fp);
            redirectFail('이미 사용한 쿠폰입니다');
        }
    }
    $usages[] = ['code' => strtoupper($couponCode), 'email' => $email,
                 'amount' => (int)$found['amount'], 'usedAt' => date('c')];
    ftruncate($cfp, 0); rewind($cfp); fwrite($cfp, json_encode($usages, JSON_UNESCAPED_UNICODE));
    fflush($cfp); flock($cfp, LOCK_UN); fclose($cfp);
    $couponDiscount = (int)$found['amount'];
}

// 정원 증가 + 저장
foreach ($partyIds as $pid) { $effective[$pid][$genderKey]++; }
$merged = $counts;
foreach ($effective as $pid => $c) $merged[$pid] = $c;
ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($merged));
fflush($fp); flock($fp, LOCK_UN); fclose($fp);

// booking row 생성
$partiesJson = file_exists("$dataDir/parties.json") ? json_decode(file_get_contents("$dataDir/parties.json"), true) : [];
$partyMap = [];
foreach ((array)$partiesJson as $p) {
    if (isset($p['id'])) $partyMap[(string)$p['id']] = $p;
}

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
    $partyPrice  = (int)($partyMap[$pid]['price'] ?? 0);
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

// pending 파일 정리
@unlink($pendingFile);

@file_put_contents("$dataDir/_toss_success.log", sprintf(
    "[%s] APPROVED orderId=%s amount=%d email=%s parties=%s\n",
    date('c'), $orderId, $amount, $email, implode(',', array_unique($partyIds))
), FILE_APPEND);

$ids = implode(',', array_unique($partyIds));
header('Location: https://thewoollim.com/payment/success/?ids=' . urlencode($ids) . '&total=' . $amount);
exit;
