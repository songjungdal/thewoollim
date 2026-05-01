<?php
/**
 * 회사 정보 (Footer 등 노출).
 *
 * GET  → { ok: true, company: { ... } }   ← 공개 (인증 불필요 — Footer 빌드용)
 * POST { action: 'save', company: {...} } → { ok: true, company }   ← 관리자 전용
 *
 * 저장: /api/data/company.json
 *
 * Company 객체 (key 자유 — 폼이 변할 수 있어 통째로 저장):
 *   { brandName?, ceo?, businessNumber?, address?, contactPhone?, email?, ... }
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();

$file = dataDir() . '/company.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $company = (object)[];
    if (file_exists($file)) {
        $d = json_decode((string)file_get_contents($file), true);
        if (is_array($d)) $company = $d;
    }
    jsonOut(['ok' => true, 'company' => $company]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    adminRequire();

    $body   = jsonBody();
    $action = (string)($body['action'] ?? '');
    if ($action !== 'save') jsonFail('unknown action');

    $company = is_array($body['company'] ?? null) ? $body['company'] : [];

    // 모든 값을 문자열로 정규화 (배열·객체 차단)
    $clean = [];
    foreach ($company as $k => $v) {
        if (!is_string($k) || !preg_match('/^[A-Za-z0-9_]{1,40}$/', $k)) continue;
        if (is_array($v) || is_object($v)) continue;
        $clean[$k] = (string)$v;
    }

    file_put_contents($file, json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

    @file_put_contents(
        dataDir() . '/_admin_company_changes.log',
        sprintf("[%s] adminId=%s\n", date('c'), $_SESSION['adminId'] ?? '?'),
        FILE_APPEND
    );

    jsonOut(['ok' => true, 'company' => $clean]);
}

jsonFail('method not allowed', 405);
