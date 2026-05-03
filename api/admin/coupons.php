<?php
/**
 * 관리자 쿠폰 관리.
 *
 * GET  → { ok: true, coupons: [...] }     (각 쿠폰에 used_count 합산 노출)
 * POST { action: 'save', coupons: [...] } → { ok: true, coupons }
 *
 * Coupon 객체:
 *   {
 *     code, expiresAt?, active, createdAt,
 *     discount_type: 'amount' | 'percent',  // 정액(원) / 정률(%)
 *     amount,                                // type=amount 면 KRW, type=percent 면 %
 *     max_discount,                          // type=percent 의 차감 한도 (KRW), 0 = 무제한
 *     max_count,                             // 총 발급 가능 수량, 0 = 무제한
 *   }
 *
 * 저장: /api/data/coupons.json (단일 진실 소스)
 *  · code 중복 검사 (대소문자 무시)
 *  · 사용 이력은 별도(/api/data/coupon_usages.json) — 본 엔드포인트는 정의만 관리
 *  · max_count enforce 는 success.php 의 atomic consume 단계에서
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

$file = dataDir() . '/coupons.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $coupons = [];
    if (file_exists($file)) {
        $d = json_decode((string)file_get_contents($file), true);
        if (is_array($d)) $coupons = $d;
    }

    // 사용 이력 → 코드별 used_count 집계 (admin UI 노출용)
    $usagesFile = dataDir() . '/coupon_usages.json';
    $usages = file_exists($usagesFile) ? json_decode((string)file_get_contents($usagesFile), true) : [];
    if (!is_array($usages)) $usages = [];
    $usedMap = [];
    foreach ($usages as $u) {
        $code = strtoupper((string)($u['code'] ?? ''));
        if ($code === '') continue;
        $usedMap[$code] = ($usedMap[$code] ?? 0) + 1;
    }

    // 모든 쿠폰에 used_count + legacy field 디폴트 채워서 응답
    $out = [];
    foreach ($coupons as $c) {
        if (!is_array($c)) continue;
        $code = strtoupper((string)($c['code'] ?? ''));
        $out[] = array_merge([
            'discount_type' => 'amount',
            'max_discount'  => 0,
            'max_count'     => 0,
        ], $c, ['used_count' => $usedMap[$code] ?? 0]);
    }
    jsonOut(['ok' => true, 'coupons' => $out]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body   = jsonBody();
    $action = (string)($body['action'] ?? '');
    if ($action !== 'save') jsonFail('unknown action');

    $raw = is_array($body['coupons'] ?? null) ? $body['coupons'] : [];

    // 중복 code 검사 + 정규화 (할인 종류 / 한도 / 수량 포함)
    $clean = [];
    $seen  = [];
    foreach ($raw as $c) {
        if (!is_array($c)) continue;
        $code = strtoupper(trim((string)($c['code'] ?? '')));
        if ($code === '' || isset($seen[$code])) continue;
        $seen[$code] = true;

        $type   = (string)($c['discount_type'] ?? 'amount');
        if (!in_array($type, ['amount', 'percent'], true)) $type = 'amount';

        $amount = max(0, (int)($c['amount'] ?? 0));
        // percent 타입은 0~100 범위로 클램프
        if ($type === 'percent') $amount = min(100, $amount);

        $clean[] = [
            'code'          => $code,
            'discount_type' => $type,
            'amount'        => $amount,
            'max_discount'  => max(0, (int)($c['max_discount'] ?? 0)),
            'max_count'     => max(0, (int)($c['max_count']    ?? 0)),
            'expiresAt'     => trim((string)($c['expiresAt'] ?? '')),
            'active'        => !empty($c['active']),
            'createdAt'     => (string)($c['createdAt'] ?? date('c')),
        ];
    }

    file_put_contents($file, json_encode($clean, JSON_UNESCAPED_UNICODE));

    @file_put_contents(
        dataDir() . '/_admin_coupon_changes.log',
        sprintf("[%s] adminId=%s count=%d\n",
            date('c'), $_SESSION['adminId'] ?? '?', count($clean)),
        FILE_APPEND
    );

    logAdminActivity('update', 'coupon', '', "쿠폰 일괄 저장 — " . count($clean) . "건", null, $clean);

    jsonOut(['ok' => true, 'coupons' => $clean]);
}

jsonFail('method not allowed', 405);
