<?php
/**
 * 관리자 후기 갤러리 CRUD.
 *
 * GET  → { ok: true, items: [...] }
 *
 * POST { action: 'create', image_path, alt_text? }            → { ok: true, id }
 * POST { action: 'delete', id }                                → { ok: true }
 * POST { action: 'update', id, alt_text? }                     → { ok: true }
 * POST { action: 'reorder', items: [{id, sort_order}, ...] }   → { ok: true }
 *
 * 관리자 세션 필수 (WOOLLIM_ADMIN). image_path 는 /uploads/gallery/<file> 또는
 * /images/gallery/<file> (마이그레이션 정적) 절대 URL.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $pdo  = getDB();
        $stmt = $pdo->query("
            SELECT id, image_path, alt_text, sort_order,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
            FROM review_gallery
            ORDER BY sort_order ASC, id ASC
        ");
        $rows = $stmt->fetchAll();
    } catch (Throwable $e) {
        error_log('[admin/gallery GET] ' . $e->getMessage());
        jsonOut(['ok' => false, 'items' => []]);
    }
    jsonOut(['ok' => true, 'items' => $rows]);
}

if ($method !== 'POST') jsonFail('method not allowed', 405);

$body   = jsonBody();
$action = (string)($body['action'] ?? '');

try {
    $pdo = getDB();

    switch ($action) {
        case 'create': {
            $img = trim((string)($body['image_path'] ?? ''));
            $alt = trim((string)($body['alt_text']   ?? ''));

            if ($img === '') jsonFail('이미지 경로가 필요합니다.');
            // 안전성: /uploads/gallery/ 또는 /images/gallery/ 만 허용
            if (!preg_match('#^/(uploads|images)/gallery/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$#i', $img)) {
                jsonFail('이미지 경로 형식이 올바르지 않습니다.');
            }
            if (mb_strlen($alt) > 200) jsonFail('alt_text 가 너무 깁니다 (최대 200자).');

            // sort_order 기본값: 현재 최대값 + 10 (뒤에 붙임)
            $stmt = $pdo->query("SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM review_gallery");
            $nextOrder = (int)($stmt->fetch()['next_order'] ?? 10);

            $stmt = $pdo->prepare("INSERT INTO review_gallery (image_path, alt_text, sort_order) VALUES (?, ?, ?)");
            $stmt->execute([$img, $alt, $nextOrder]);
            $newId = (int)$pdo->lastInsertId();

            logAdminActivity('create', 'gallery', (string)$newId, "후기 갤러리 등록 — {$img}", null, ['image_path' => $img, 'alt_text' => $alt]);
            jsonOut(['ok' => true, 'id' => $newId]);
        }

        case 'delete': {
            $id = (int)($body['id'] ?? 0);
            if ($id <= 0) jsonFail('id 가 필요합니다.');

            // 삭제 전 image_path 저장 (uploads/ 경로면 파일도 삭제)
            $stmt = $pdo->prepare("SELECT image_path FROM review_gallery WHERE id = ? LIMIT 1");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) jsonFail('해당 갤러리 항목을 찾을 수 없습니다.', 404);

            $pdo->prepare("DELETE FROM review_gallery WHERE id = ?")->execute([$id]);

            // /uploads/gallery/ 하위 파일은 함께 정리 (마이그레이션된 /images/ 정적은 보존)
            $img = (string)$row['image_path'];
            if (str_starts_with($img, '/uploads/gallery/')) {
                $abs = dirname(__DIR__, 2) . $img;
                if (is_file($abs)) @unlink($abs);
            }

            logAdminActivity('delete', 'gallery', (string)$id, "후기 갤러리 삭제 — {$img}", ['image_path' => $img], null);
            jsonOut(['ok' => true]);
        }

        case 'update': {
            $id  = (int)($body['id'] ?? 0);
            $alt = trim((string)($body['alt_text'] ?? ''));
            if ($id <= 0) jsonFail('id 가 필요합니다.');
            if (mb_strlen($alt) > 200) jsonFail('alt_text 가 너무 깁니다.');

            $stmt = $pdo->prepare("UPDATE review_gallery SET alt_text = ? WHERE id = ?");
            $stmt->execute([$alt, $id]);

            logAdminActivity('update', 'gallery', (string)$id, "후기 갤러리 alt 수정", null, ['alt_text' => $alt]);
            jsonOut(['ok' => true]);
        }

        case 'reorder': {
            $items = $body['items'] ?? null;
            if (!is_array($items)) jsonFail('items 배열이 필요합니다.');

            $pdo->beginTransaction();
            $stmt = $pdo->prepare("UPDATE review_gallery SET sort_order = ? WHERE id = ?");
            foreach ($items as $it) {
                if (!is_array($it)) continue;
                $id  = (int)($it['id']         ?? 0);
                $ord = (int)($it['sort_order'] ?? 0);
                if ($id > 0) $stmt->execute([$ord, $id]);
            }
            $pdo->commit();

            logAdminActivity('update', 'gallery', '', "후기 갤러리 순서 재정렬 — " . count($items) . "건", null, $items);
            jsonOut(['ok' => true]);
        }

        default:
            jsonFail('unknown action');
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[admin/gallery POST] ' . $e->getMessage());
    jsonFail('처리 중 오류가 발생했습니다.', 500);
}
