<?php
/**
 * 쿠폰 유효성 검증 (체크아웃 단계 사전 적용).
 *
 * POST { code, email } → { ok: true, coupon: { code, amount } }
 *  - 실 차감은 결제 성공 시(payments/success.php)에 atomic 발생
 *  - 본 단계는 가용성만 응답 (만료/active/사용이력 검사)
 *
 * 본인 데이터만 — email 이 세션 이메일과 일치해야 함.
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body  = jsonBody();
$email = normalizeEmail((string)($body['email'] ?? ''));
$code  = strtoupper(trim((string)($body['code'] ?? '')));
requireUser($email);

if ($code === '' || strlen($code) > 32) jsonFail('쿠폰 코드를 입력해주세요.');

$dir         = dataDir();
$couponsFile = $dir . '/coupons.json';
$usagesFile  = $dir . '/coupon_usages.json';

$coupons = file_exists($couponsFile) ? json_decode((string)file_get_contents($couponsFile), true) : [];
if (!is_array($coupons)) $coupons = [];

$found = null;
foreach ($coupons as $c) {
    if (strtoupper((string)($c['code'] ?? '')) === $code) { $found = $c; break; }
}
if (!$found || empty($found['active'])) jsonFail('유효하지 않은 쿠폰입니다.');

if (!empty($found['expiresAt']) && strtotime((string)$found['expiresAt']) < strtotime(date('Y-m-d'))) {
    jsonFail('만료된 쿠폰입니다.');
}

$usages = file_exists($usagesFile) ? json_decode((string)file_get_contents($usagesFile), true) : [];
if (!is_array($usages)) $usages = [];
foreach ($usages as $u) {
    if (strtoupper((string)($u['code'] ?? '')) === $code &&
        normalizeEmail((string)($u['email'] ?? '')) === $email) {
        jsonFail('이미 사용한 쿠폰입니다.');
    }
}

// 총 발급 수량 한도 — max_count 가 양수면 사용 횟수가 그에 도달했는지 확인
$maxCount = max(0, (int)($found['max_count'] ?? 0));
if ($maxCount > 0) {
    $used = countCouponUsages($usages, $code);
    if ($used >= $maxCount) jsonFail('쿠폰 발급 수량이 모두 소진되었습니다.');
}

$type = (string)($found['discount_type'] ?? 'amount');
if (!in_array($type, ['amount', 'percent'], true)) $type = 'amount';

jsonOut([
    'ok'     => true,
    'coupon' => [
        'code'          => strtoupper((string)$found['code']),
        'discount_type' => $type,
        'amount'        => (int)($found['amount']       ?? 0),
        'max_discount'  => (int)($found['max_discount'] ?? 0),
    ],
]);
