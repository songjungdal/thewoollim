<?php
/**
 * 후기 갤러리 (공개) — 메인페이지 후기 섹션이 fetch.
 *
 * GET → [{ id, image_path, alt_text, sort_order }]
 *  · sort_order 오름차순 → 같으면 id 오름차순
 *  · 정적 export 환경이라 클라이언트 폴링 (10초) + BroadcastChannel 로 실시간 동기화
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/db.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);

try {
    $pdo = getDB();
    $stmt = $pdo->query("
        SELECT id, image_path, alt_text, sort_order
        FROM review_gallery
        ORDER BY sort_order ASC, id ASC
    ");
    $rows = $stmt->fetchAll();
} catch (Throwable $e) {
    error_log('[gallery] ' . $e->getMessage());
    echo json_encode([]);
    exit;
}

$out = [];
foreach ($rows as $r) {
    $out[] = [
        'id'         => (int)$r['id'],
        'image_path' => (string)$r['image_path'],
        'alt_text'   => (string)$r['alt_text'],
        'sort_order' => (int)$r['sort_order'],
    ];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
