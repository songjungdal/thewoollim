<?php
/**
 * 장바구니 (서버 동기화).
 *
 * GET  ?email=<x>           → CartItem[]   ({ partyId, quantity })
 * POST { email, cart: [...] } → { ok: true }
 *
 * 본인 데이터만 — email 파라미터/바디가 세션 이메일과 일치해야 함.
 * 저장: /api/data/cart_<md5(email)>.json
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/auth/_session.php';
jsonHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$dir    = dataDir();

if ($method === 'GET') {
    $email = normalizeEmail((string)($_GET['email'] ?? ''));
    if ($email === '') jsonOut([]);
    requireUser($email);

    $f = $dir . '/cart_' . md5($email) . '.json';
    if (!file_exists($f)) jsonOut([]);
    $d = json_decode((string)file_get_contents($f), true);
    jsonOut(is_array($d) ? $d : []);
}

if ($method === 'POST') {
    $body  = jsonBody();
    $email = normalizeEmail((string)($body['email'] ?? ''));
    requireUser($email);

    $cart = is_array($body['cart'] ?? null) ? $body['cart'] : [];
    $clean = [];
    foreach ($cart as $item) {
        if (!is_array($item) || empty($item['partyId'])) continue;
        $q = (int)($item['quantity'] ?? 1);
        if ($q < 1) $q = 1;
        $clean[] = ['partyId' => (string)$item['partyId'], 'quantity' => $q];
    }
    file_put_contents($dir . '/cart_' . md5($email) . '.json', json_encode($clean, JSON_UNESCAPED_UNICODE));
    jsonOut(['ok' => true]);
}

jsonFail('method not allowed', 405);
