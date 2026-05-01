<?php
/**
 * 관리자 쿠폰 관리.
 *
 * GET  → { ok: true, coupons: [...] }
 * POST { action: 'save', coupons: [...] } → { ok: true, coupons }
 *
 * Coupon 객체:
 *   { code, amount, expiresAt?, active, createdAt }
 *
 * 저장: /api/data/coupons.json (단일 진실 소스)
 *  · code 중복 검사 (대소문자 무시)
 *  · 사용 이력은 별도(/api/data/coupon_usages.json) — 본 엔드포인트는 정의만 관리
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
    jsonOut(['ok' => true, 'coupons' => $coupons]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body   = jsonBody();
    $action = (string)($body['action'] ?? '');
    if ($action !== 'save') jsonFail('unknown action');

    $raw = is_array($body['coupons'] ?? null) ? $body['coupons'] : [];

    // 중복 code 검사 + 정규화
    $clean = [];
    $seen  = [];
    foreach ($raw as $c) {
        if (!is_array($c)) continue;
        $code = strtoupper(trim((string)($c['code'] ?? '')));
        if ($code === '' || isset($seen[$code])) continue;
        $seen[$code] = true;
        $clean[] = [
            'code'      => $code,
            'amount'    => max(0, (int)($c['amount'] ?? 0)),
            'expiresAt' => trim((string)($c['expiresAt'] ?? '')),
            'active'    => !empty($c['active']),
            'createdAt' => (string)($c['createdAt'] ?? date('c')),
        ];
    }

    file_put_contents($file, json_encode($clean, JSON_UNESCAPED_UNICODE));

    @file_put_contents(
        dataDir() . '/_admin_coupon_changes.log',
        sprintf("[%s] adminId=%s count=%d\n",
            date('c'), $_SESSION['adminId'] ?? '?', count($clean)),
        FILE_APPEND
    );

    jsonOut(['ok' => true, 'coupons' => $clean]);
}

jsonFail('method not allowed', 405);
