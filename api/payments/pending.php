<?php
/**
 * 결제 직전 pending order 생성.
 *
 * POST { partyIds: ["1","2",...], couponCode?, couponPartyId? }
 *  → { ok:true, orderId, amount, orderName, customerEmail }
 *
 * 흐름:
 *  1) 회원 세션 + 프로필(특히 gender) 검증
 *  2) parties.json 조회 → 합산 금액 계산
 *  3) 쿠폰 적용 가능 여부 검증 (실제 차감은 success.php 가 atomic 수행)
 *  4) /api/data/pending/<orderId>.json 저장 (10분 만료)
 *  5) Toss 결제창 호출에 필요한 메타 반환
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

$couponCode    = strtoupper(trim((string)($body['couponCode']    ?? '')));
$couponPartyId = trim((string)        ($body['couponPartyId'] ?? ''));

// 회원 정보 조회
try {
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT email, name, gender FROM users WHERE id = ? AND status='active' LIMIT 1");
    $stmt->execute([currentUserId()]);
    $u = $stmt->fetch();
    if (!$u || !in_array($u['gender'], ['남성','여성'], true)) {
        jsonFail('프로필 정보(성별)가 필요합니다.', 400);
    }
} catch (Throwable $e) {
    error_log('[payments/pending] ' . $e->getMessage()); jsonFail('서버 오류', 500);
}

// parties.json
$dir = dataDir();
$parties = json_decode((string)file_get_contents($dir . '/parties.json'), true);
$partyMap = [];
foreach ((array)$parties as $p) {
    if (isset($p['id'])) $partyMap[(string)$p['id']] = $p;
}

$total = 0; $orderTitles = [];
foreach ($partyIds as $pid) {
    if (!isset($partyMap[$pid])) jsonFail("파티를 찾을 수 없습니다: $pid", 404);
    $total += (int)($partyMap[$pid]['price'] ?? 0);
    $orderTitles[] = (string)($partyMap[$pid]['title'] ?? '파티');
}

// 쿠폰 적용 가능 검사 (실 차감은 success 에서)
$couponDiscount = 0;
if ($couponCode !== '') {
    $coupons = json_decode((string)@file_get_contents($dir . '/coupons.json'), true);
    if (!is_array($coupons)) $coupons = [];
    $found = null;
    foreach ($coupons as $c) {
        if (strtoupper((string)($c['code'] ?? '')) === $couponCode) { $found = $c; break; }
    }
    if (!$found || empty($found['active'])) jsonFail('쿠폰이 유효하지 않습니다.');
    if (!empty($found['expiresAt']) && strtotime($found['expiresAt']) < strtotime(date('Y-m-d'))) {
        jsonFail('만료된 쿠폰입니다.');
    }
    if (!in_array($couponPartyId, $partyIds, true)) jsonFail('쿠폰 적용 파티를 선택해주세요.');

    // 총 수량 한도 사전 체크 (실 차감은 success 의 atomic consume)
    $maxCount = max(0, (int)($found['max_count'] ?? 0));
    if ($maxCount > 0) {
        $usages = json_decode((string)@file_get_contents($dir . '/coupon_usages.json'), true);
        if (!is_array($usages)) $usages = [];
        if (countCouponUsages($usages, $couponCode) >= $maxCount) {
            jsonFail('쿠폰 발급 수량이 모두 소진되었습니다.');
        }
    }

    $linePrice      = (int)($partyMap[$couponPartyId]['price'] ?? 0);
    $couponDiscount = calcCouponDiscount($found, $linePrice);
}

$amount = max(0, $total - $couponDiscount);
if ($amount <= 0) jsonFail('결제 금액이 0원 이하입니다.');

// orderId — 영숫자/언더스코어/하이픈만
$orderId = 'ord_' . bin2hex(random_bytes(12));

$pendingDir = $dir . '/pending';
if (!is_dir($pendingDir)) {
    @mkdir($pendingDir, 0775, true);
}
$payload = [
    'orderId'        => $orderId,
    'email'          => $u['email'],
    'name'           => $u['name'],
    'gender'         => $u['gender'],
    'partyIds'       => $partyIds,
    'expectedAmount' => $amount,
    'couponCode'     => $couponCode,
    'couponPartyId'  => $couponPartyId,
    'createdAt'      => time(),
    'expiresAt'      => time() + 600, // 10분
];
file_put_contents($pendingDir . '/' . $orderId . '.json', json_encode($payload, JSON_UNESCAPED_UNICODE));

$orderName = count($partyIds) > 1
    ? ($orderTitles[0] . ' 외 ' . (count($partyIds) - 1) . '건')
    : $orderTitles[0];

jsonOut([
    'ok'            => true,
    'orderId'       => $orderId,
    'amount'        => $amount,
    'orderName'     => $orderName,
    'customerEmail' => $u['email'],
    'customerName'  => $u['name'],
]);
