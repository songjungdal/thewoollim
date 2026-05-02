<?php
/**
 * 관리자 업무 메모 CRUD (포스트잇).
 *
 * GET  → { ok: true, items: [{id, content, color, author_id, created_at, updated_at}, ...] }
 *         · updated_at DESC 정렬 (최근 수정 먼저)
 *
 * POST { action: 'create', content, color? }     → { ok: true, id }
 * POST { action: 'update', id, content?, color? } → { ok: true }
 * POST { action: 'delete', id }                  → { ok: true }
 *
 * 모든 관리자(role='admin') 가 같은 메모를 공유 — 등록자 author_id 만 추적용 기록.
 * 본문 길이 제한: TEXT 컬럼이지만 실용 한도 5000자 (안전).
 * 색상 화이트리스트: 파스텔 8색 — 임의 hex 입력 차단 (XSS / 시각 통일).
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

const ALLOWED_COLORS = [
    '#FEF9C3', // 연한 노랑
    '#CCFBF1', // 연한 청록
    '#FCE7F3', // 연한 핑크
    '#DBEAFE', // 연한 하늘
    '#DCFCE7', // 연한 연두
    '#FED7AA', // 연한 주황
    '#E9D5FF', // 연한 보라
    '#F3F4F6', // 연한 회색
];
const DEFAULT_COLOR  = '#FEF9C3';
const MAX_CONTENT    = 5000;

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $pdo  = getDB();
        $stmt = $pdo->query("
            SELECT id, content, color, author_id,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at,
                   DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updated_at
            FROM admin_memos
            ORDER BY updated_at DESC, id DESC
        ");
        $items = $stmt->fetchAll();
    } catch (Throwable $e) {
        error_log('[admin/memos GET] ' . $e->getMessage());
        jsonOut(['ok' => false, 'items' => []]);
    }
    jsonOut(['ok' => true, 'items' => $items]);
}

if ($method !== 'POST') jsonFail('method not allowed', 405);

$body   = jsonBody();
$action = (string)($body['action'] ?? '');
$adminId = (string)($_SESSION['adminId'] ?? '?');

try {
    $pdo = getDB();

    switch ($action) {
        case 'create': {
            $content = trim((string)($body['content'] ?? ''));
            $color   = (string)($body['color'] ?? DEFAULT_COLOR);

            if ($content === '') jsonFail('내용을 입력해주세요.');
            if (mb_strlen($content) > MAX_CONTENT) jsonFail('내용이 너무 깁니다 (최대 ' . MAX_CONTENT . '자).');
            if (!in_array($color, ALLOWED_COLORS, true)) $color = DEFAULT_COLOR;

            $stmt = $pdo->prepare("INSERT INTO admin_memos (content, color, author_id) VALUES (?, ?, ?)");
            $stmt->execute([$content, $color, $adminId]);
            $newId = (int)$pdo->lastInsertId();

            logAdminActivity('create', 'memo', (string)$newId, "업무 메모 등록 — " . mb_substr($content, 0, 30));
            jsonOut(['ok' => true, 'id' => $newId]);
        }

        case 'update': {
            $id = (int)($body['id'] ?? 0);
            if ($id <= 0) jsonFail('id 가 필요합니다.');

            $set = [];
            $params = [];
            if (array_key_exists('content', $body)) {
                $content = trim((string)$body['content']);
                if ($content === '') jsonFail('내용을 입력해주세요.');
                if (mb_strlen($content) > MAX_CONTENT) jsonFail('내용이 너무 깁니다.');
                $set[] = 'content = ?'; $params[] = $content;
            }
            if (array_key_exists('color', $body)) {
                $color = (string)$body['color'];
                if (!in_array($color, ALLOWED_COLORS, true)) $color = DEFAULT_COLOR;
                $set[] = 'color = ?';   $params[] = $color;
            }
            if (empty($set)) jsonFail('수정할 항목이 없습니다.');

            $params[] = $id;
            $stmt = $pdo->prepare("UPDATE admin_memos SET " . implode(', ', $set) . " WHERE id = ?");
            $stmt->execute($params);

            logAdminActivity('update', 'memo', (string)$id, "업무 메모 수정 #" . $id);
            jsonOut(['ok' => true]);
        }

        case 'delete': {
            $id = (int)($body['id'] ?? 0);
            if ($id <= 0) jsonFail('id 가 필요합니다.');

            // 삭제 전 본문 일부 로그용 보존
            $stmt = $pdo->prepare("SELECT content FROM admin_memos WHERE id = ? LIMIT 1");
            $stmt->execute([$id]);
            $prev = $stmt->fetch();
            if (!$prev) jsonFail('해당 메모를 찾을 수 없습니다.', 404);

            $pdo->prepare("DELETE FROM admin_memos WHERE id = ?")->execute([$id]);

            logAdminActivity('delete', 'memo', (string)$id,
                "업무 메모 삭제 — " . mb_substr((string)$prev['content'], 0, 30));
            jsonOut(['ok' => true]);
        }

        default:
            jsonFail('unknown action');
    }
} catch (Throwable $e) {
    error_log('[admin/memos POST] ' . $e->getMessage());
    jsonFail('처리 중 오류가 발생했습니다.', 500);
}
