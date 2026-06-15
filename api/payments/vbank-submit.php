<?php
/**
 * 무통장 입금 신청 접수 (vbank).  v7.0
 *
 * POST { partyIds: ["1",...], couponCode?, couponPartyId? }
 *   → { ok:true, amount, orderName }
 *
 * 카드결제(Toss success.php)와의 차이:
 *   - booking status = 'vbank_pending' ('입금 확인 중'). 관리자 [결제확인] 전까지 미확정.
 *   - party_counts(정원/인원 카운트)를 **증가시키지 않는다.** 입금 확인(관리자 승인) 시점에
 *     admin/bookings.php(action=confirm_vbank)가 +1 반영 → 그 전까지 재고/명단에서 제외.
 *   - 쿠폰은 신청 시점에 atomic consume (success.php 와 동일 규칙 — 발급수량/중복 enforce).
 *   - 결제된 partyId 만 장바구니에서 정밀 제거 (success.php 와 동일).
 *
 * 흐름:
 *   1) 회원 세션 + 프로필(성별) 검증
 *   2) 중복 신청 차단 (cancelled 아닌 booking 이 겹치면 거절)
 *   3) parties.json 기준 성별 단가 합산 → amount
 *   4) 쿠폰 검증 + atomic consume
 *   5) booking(vbank_pending) 생성 — counts 미반영
 *   6) 장바구니에서 신청 partyId 제거
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

requireUser();
$body = jsonBody();

$partyIds = array_values(array_filter(array_map('strval', $body['partyIds'] ?? []), fn($x) => $x !== ''));
if (empty($partyIds)) jsonFail('파티를 선택해주세요.');
$partyIds = array_values(array_unique($partyIds)); // 수량 개념 없음 — unique 화

$couponCode    = strtoupper(trim((string)($body['couponCode']    ?? '')));
$couponPartyId = trim((string)        ($body['couponPartyId'] ?? ''));

$dataDir = __DIR__ . '/../data';

// ── 1) 회원 정보 (성별) ───────────────────────────────────────────────
try {
    $pdo  = getDB();
    $stmt = $pdo->prepare("SELECT email, name, gender FROM users WHERE id = ? AND status='active' LIMIT 1");
    $stmt->execute([currentUserId()]);
    $u = $stmt->fetch();
    if (!$u || !in_array($u['gender'], ['남성','여성'], true)) {
        jsonFail('프로필 정보(성별)가 필요합니다.', 400);
    }
} catch (Throwable $e) {
    error_log('[payments/vbank-submit] ' . $e->getMessage()); jsonFail('서버 오류', 500);
}
$email     = (string)$u['email'];
$gender    = (string)$u['gender'];
$genderKey = $gender === '남성' ? 'male' : 'female';

// ── parties.json ─────────────────────────────────────────────────────
$parties = json_decode((string)@file_get_contents($dataDir . '/parties.json'), true);
$partyMap = [];
foreach ((array)$parties as $p) {
    if (isset($p['id'])) $partyMap[(string)$p['id']] = $p;
}

// ── 2) 중복 신청 차단 (cancelled 아닌 booking 이 겹치면 거절) ─────────────
$bookingsFile = $dataDir . '/bookings_' . md5(strtolower(trim($email))) . '.json';
$bookings = file_exists($bookingsFile) ? json_decode((string)file_get_contents($bookingsFile), true) : [];
if (!is_array($bookings)) $bookings = [];
$dupTitles = [];
foreach ($bookings as $b) {
    if (!is_array($b)) continue;
    $bpid = (string)($b['partyId'] ?? '');
    $bst  = (string)($b['status']  ?? '');
    if (in_array($bpid, $partyIds, true) && $bst !== 'cancelled') {
        $dupTitles[] = (string)($partyMap[$bpid]['title'] ?? "파티 #$bpid");
    }
}
if (!empty($dupTitles)) {
    jsonFail('이미 신청이 완료된 파티입니다. 마이페이지에서 예약 현황을 확인해주세요. (' . implode(', ', array_unique($dupTitles)) . ')', 409);
}

// ── 3) 성별 단가 합산 ─────────────────────────────────────────────────
$total = 0; $orderTitles = [];
foreach ($partyIds as $pid) {
    if (!isset($partyMap[$pid])) jsonFail("파티를 찾을 수 없습니다: $pid", 404);
    $total += priceForGender($partyMap[$pid], $gender);
    $orderTitles[] = (string)($partyMap[$pid]['title'] ?? '파티');
}

// ── 4) 쿠폰 검증 + atomic consume (success.php 와 동일 규칙) ──────────────
$couponDiscount = 0;
if ($couponCode !== '') {
    $couponsFile = "$dataDir/coupons.json";
    $usagesFile  = "$dataDir/coupon_usages.json";
    $coupons = file_exists($couponsFile) ? json_decode((string)file_get_contents($couponsFile), true) : [];
    if (!is_array($coupons)) $coupons = [];
    $found = null;
    foreach ($coupons as $c) {
        if (strtoupper((string)($c['code'] ?? '')) === $couponCode) { $found = $c; break; }
    }
    if (!$found || empty($found['active']) ||
        (!empty($found['expiresAt']) && strtotime($found['expiresAt']) < strtotime(date('Y-m-d')))) {
        jsonFail('쿠폰이 유효하지 않습니다.');
    }
    if (!in_array($couponPartyId, $partyIds, true)) jsonFail('쿠폰 적용 파티를 선택해주세요.');
    if (!isset($partyMap[$couponPartyId]))          jsonFail('쿠폰 적용 파티를 찾을 수 없습니다.');

    $linePrice      = priceForGender($partyMap[$couponPartyId], $gender);
    $couponDiscount = calcCouponDiscount($found, $linePrice);

    $cfp = fopen($usagesFile, 'c+');
    if ($cfp) {
        flock($cfp, LOCK_EX);
        $craw = stream_get_contents($cfp);
        $usages = $craw ? json_decode($craw, true) : [];
        if (!is_array($usages)) $usages = [];
        // 동일 사용자 중복 사용 차단
        foreach ($usages as $usage) {
            if (strtoupper((string)($usage['code'] ?? '')) === $couponCode &&
                strtolower((string)($usage['email'] ?? '')) === strtolower($email)) {
                flock($cfp, LOCK_UN); fclose($cfp);
                jsonFail('이미 사용한 쿠폰입니다.');
            }
        }
        // 총 발급 수량 한도 enforce
        $maxCount = max(0, (int)($found['max_count'] ?? 0));
        if ($maxCount > 0 && countCouponUsages($usages, $couponCode) >= $maxCount) {
            flock($cfp, LOCK_UN); fclose($cfp);
            jsonFail('쿠폰 발급 수량이 모두 소진되었습니다.');
        }
        $usages[] = [
            'code'          => $couponCode,
            'email'         => $email,
            'discount_type' => (string)($found['discount_type'] ?? 'amount'),
            'amount'        => (int)($found['amount'] ?? 0),
            'discount'      => $couponDiscount,
            'usedAt'        => date('c'),
        ];
        ftruncate($cfp, 0); rewind($cfp); fwrite($cfp, json_encode($usages, JSON_UNESCAPED_UNICODE));
        fflush($cfp); flock($cfp, LOCK_UN); fclose($cfp);
    }
}

$amount = max(0, $total - $couponDiscount);
if ($amount <= 0) jsonFail('결제 금액이 0원 이하입니다.');

// ── 5) booking(vbank_pending) 생성 — counts 미반영 ────────────────────────
$now = date('c');
$couponApplied = false;
foreach ($partyIds as $pid) {
    $partyPrice  = priceForGender($partyMap[$pid] ?? [], $gender);
    $isCouponHit = ($couponCode !== '' && $pid === $couponPartyId && !$couponApplied);
    $rowDiscount = $isCouponHit ? $couponDiscount : 0;
    if ($isCouponHit) $couponApplied = true;
    $rowTotal = max(0, $partyPrice - $rowDiscount);
    $bookings[] = [
        'id'            => bin2hex(random_bytes(8)),
        'partyId'       => $pid,
        'status'        => 'vbank_pending',
        'paymentMethod' => 'vbank',
        'paymentId'     => null,
        'total'         => $rowTotal,
        'gender'        => $gender,
        'couponCode'    => $isCouponHit ? $couponCode : null,
        'discount'      => $rowDiscount,
        'createdAt'     => $now,
        'updatedAt'     => $now,
    ];
}
file_put_contents($bookingsFile, json_encode($bookings, JSON_UNESCAPED_UNICODE));

// ── 6) 장바구니에서 신청 partyId 정밀 제거 (success.php 와 동일, atomic) ────
$cartFile = $dataDir . '/cart_' . md5(strtolower(trim($email))) . '.json';
if (file_exists($cartFile)) {
    $cfp = fopen($cartFile, 'c+');
    if ($cfp) {
        flock($cfp, LOCK_EX);
        $craw = stream_get_contents($cfp);
        $current = $craw ? json_decode($craw, true) : [];
        if (!is_array($current)) $current = [];
        $paidSet = array_flip(array_map('strval', $partyIds));
        $kept = [];
        foreach ($current as $item) {
            if (!is_array($item)) continue;
            $pid = (string)($item['partyId'] ?? '');
            if ($pid !== '' && isset($paidSet[$pid])) continue;
            $kept[] = $item;
        }
        ftruncate($cfp, 0); rewind($cfp); fwrite($cfp, json_encode($kept, JSON_UNESCAPED_UNICODE));
        fflush($cfp); flock($cfp, LOCK_UN); fclose($cfp);
    }
}

@file_put_contents("$dataDir/_vbank_submit.log", sprintf(
    "[%s] SUBMIT email=%s amount=%d parties=%s coupon=%s\n",
    $now, $email, $amount, implode(',', $partyIds), $couponCode
), FILE_APPEND);

$orderName = count($partyIds) > 1
    ? ($orderTitles[0] . ' 외 ' . (count($partyIds) - 1) . '건')
    : $orderTitles[0];

jsonOut([
    'ok'        => true,
    'amount'    => $amount,
    'orderName' => $orderName,
]);
