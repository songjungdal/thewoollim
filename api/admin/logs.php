<?php
/**
 * 관리자 활동 로그 조회.
 *
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&admin=<id>&action=<x>&limit=<n>
 *  → { ok: true, rows: AdminLogRow[], total: int }
 *
 * 데이터 소스: /api/data/admin_activity.json (logAdminActivity() 가 append)
 *
 * AdminLogRow:
 *   { id, created_at, admin_id, ip, action, target_type, target_id,
 *     summary, before_value, after_value, user_agent }
 *
 * 필터:
 *  - from / to : created_at 범위 (포함, 'YYYY-MM-DD' 입력)
 *  - admin     : admin_id 부분 일치 (대소문자 무시)
 *  - action    : 정확 일치 (login|logout|create|update|delete 등)
 *  - limit     : 응답 행 수 (기본 200, 최대 1000) — 최신순
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);

$file = dataDir() . '/admin_activity.json';

$rows = [];
if (file_exists($file)) {
    $raw = file_get_contents($file);
    $d = json_decode((string)$raw, true);
    if (is_array($d)) $rows = $d;
}

$total = count($rows);

// 필터링
$from   = trim((string)($_GET['from']   ?? ''));
$to     = trim((string)($_GET['to']     ?? ''));
$admin  = strtolower(trim((string)($_GET['admin'] ?? '')));
$action = trim((string)($_GET['action'] ?? ''));
$limit  = max(1, min(1000, (int)($_GET['limit'] ?? 200)));

$filtered = $rows;

if ($from !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
    $filtered = array_filter($filtered, fn($r) => substr((string)($r['created_at'] ?? ''), 0, 10) >= $from);
}
if ($to !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
    $filtered = array_filter($filtered, fn($r) => substr((string)($r['created_at'] ?? ''), 0, 10) <= $to);
}
if ($admin !== '') {
    $filtered = array_filter($filtered, fn($r) => str_contains(strtolower((string)($r['admin_id'] ?? '')), $admin));
}
if ($action !== '') {
    $filtered = array_filter($filtered, fn($r) => (string)($r['action'] ?? '') === $action);
}

// 최신순 정렬 + limit
$filtered = array_values($filtered);
usort($filtered, fn($a, $b) => (int)($b['id'] ?? 0) - (int)($a['id'] ?? 0));
$filtered = array_slice($filtered, 0, $limit);

jsonOut([
    'ok'    => true,
    'rows'  => $filtered,
    'total' => $total,
]);
