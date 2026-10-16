<?php
/**
 * 장바구니 (서버 동기화).
 *
 * GET  ?email=<x>           → CartItem[]   ({ partyId, optionId?, quantity })
 * POST { email, cart: [...] } → { ok: true }
 *
 * optionId: 참가 구성이 있는 솔로파티에서 고른 항목. 그 파티에 실제 있는 항목일 때만 저장한다
 *           (없거나 잘못되면 빼고 저장 → 결제 화면에서 다시 고르게 함). 파티당 한 줄 — 같은 파티가 또 오면 뒤의 것으로 바꾼다.
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
    $partyMap = [];
    foreach ((array)json_decode((string)@file_get_contents($dir . '/parties.json'), true) as $p) {
        if (is_array($p) && isset($p['id'])) $partyMap[(string)$p['id']] = $p;
    }
    $clean = [];
    foreach ($cart as $item) {
        if (!is_array($item) || empty($item['partyId'])) continue;
        $pid = (string)$item['partyId'];
        $q = (int)($item['quantity'] ?? 1);
        if ($q < 1) $q = 1;
        $row = ['partyId' => $pid, 'quantity' => $q];
        $oid = (string)($item['optionId'] ?? '');
        if ($oid !== '' && isset($partyMap[$pid]) && partyOptionById($partyMap[$pid], $oid) !== null) $row['optionId'] = $oid;
        $clean[$pid] = $row;   // 파티당 한 줄 — 나중 것이 앞의 것을 바꾼다
    }
    $clean = array_values($clean);
    file_put_contents($dir . '/cart_' . md5($email) . '.json', json_encode($clean, JSON_UNESCAPED_UNICODE));
    jsonOut(['ok' => true]);
}

jsonFail('method not allowed', 405);
