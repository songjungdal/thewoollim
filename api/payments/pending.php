<?php
/**
 * 결제 직전 pending order 생성.
 *
 * POST { partyIds: ["1","2",...], optionIds?: { "<partyId>": "<optionId>" }, couponCode?, couponPartyId? }
 *   optionIds: 참가 구성이 있는 솔로파티는 필수 (없거나 그 파티의 항목이 아니면 거절). 다른 파티는 무시.
 *  → { ok:true, orderId, amount, orderName, customerEmail }
 *
 * 흐름:
 *  1) 회원 세션 + 프로필(특히 gender) 검증
 *  2) parties.json 조회 → 합산 금액 계산 (항목이 있는 파티는 항목 가격, 정원은 항목에 포함된 회차마다 검사)
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

// 수량 개념 제거 — 동일 partyId 가 중복돼있으면 unique 화 (legacy clients 방어)
$partyIds = array_values(array_unique($partyIds));

$optionIdsIn   = is_array($body['optionIds'] ?? null) ? $body['optionIds'] : [];
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

// ── 중복 신청 차단 (서버 방어선) — 동일 partyId 에 cancelled 가 아닌 booking 이 있으면 거절
$bookingsFile = $dir . '/bookings_' . md5(strtolower(trim((string)$u['email']))) . '.json';
if (file_exists($bookingsFile)) {
    $existing = json_decode((string)file_get_contents($bookingsFile), true);
    if (is_array($existing)) {
        $dupTitles = [];
        foreach ($existing as $b) {
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
    }
}

// 회원 성별 기준 참가비 — priceMale/priceFemale 우선, 미설정 시 price 폴백. 항목이 있는 파티는 고른 항목의 성별 가격.
$userGender = (string)($u['gender'] ?? '');
$genderKey  = $userGender === '남성' ? 'male' : 'female';
$total = 0; $orderTitles = [];
$lines = [];      // partyId => 줄 가격 (결제 시점 가격 — success.php 가 예약 금액에 그대로 씀)
$optionIds = [];  // partyId => optionId (항목이 있는 파티만)
$plainIds = [];   // 항목이 없는 파티 — 기존 파티 단위 정원 검사
$counts = json_decode((string)@file_get_contents($dir . '/party_counts.json'), true);
if (!is_array($counts)) $counts = [];
foreach ($partyIds as $pid) {
    if (!isset($partyMap[$pid])) jsonFail("파티를 찾을 수 없습니다: $pid", 404);
    $oidIn = $optionIdsIn[$pid] ?? '';
    $resolved = resolvePartyOption($partyMap[$pid], $userGender, is_scalar($oidIn) ? (string)$oidIn : '');
    if (is_string($resolved)) jsonFail($resolved);
    $lines[$pid] = $resolved['price'];
    $total += $resolved['price'];
    $title = (string)($partyMap[$pid]['title'] ?? '파티');
    if ($resolved['option'] !== null) {
        $optionIds[$pid] = (string)$resolved['option']['id'];
        $title .= ' · ' . (string)$resolved['option']['name'];
        // 정원 사전 검사 — 항목에 포함된 회차를 모두 회원 성별 기준으로 (최종 판정은 success.php)
        if (optionSessionsOverStock($partyMap[$pid], $resolved['option'], (array)($counts[$pid] ?? []), $genderKey)) {
            jsonFail('정원이 마감되었습니다.');
        }
    } else {
        $plainIds[] = $pid;
    }
    $orderTitles[] = $title;
}

// 정원 사전 검사 — 결제창을 열기 전에 회원 성별 기준으로 파티마다 확인 (최종 판정은 success.php)
if (!empty(partiesOverStock($plainIds, $partyMap, $genderKey))) {
    jsonFail('정원이 마감되었습니다.');
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
    if (!couponAllowsGender($found, $userGender)) {
        $maleOk = !array_key_exists('maleAllowed', $found) || !empty($found['maleAllowed']);
        jsonFail(($maleOk ? '남성' : '여성') . ' 회원만 사용할 수 있는 쿠폰입니다.');
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

    // 쿠폰 대상 파티의 성별별 가격(항목이 있으면 고른 항목 가격) 기준으로 할인 계산
    $linePrice      = (int)$lines[$couponPartyId];
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
    'optionIds'      => (object)$optionIds,
    'lines'          => (object)$lines,
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
