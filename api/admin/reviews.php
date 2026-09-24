<?php
/**
 * 관리자 후기게시판 관리.
 *
 * GET  → 전체 후기 목록, 작성자 신원 포함 (author_name/author_email/author_phone)
 * POST { action:'create', gender, age_group, rating, content } → 관리자 직접 등록 (is_admin_created=1)
 * POST { action:'update', id, gender, age_group, rating, content } → 수정 (회원 작성분 포함, 누구나 가능)
 * POST { action:'delete', id } → 삭제
 *
 * 일반 사용자용 공개 API(api/reviews.php)는 익명 필드만 노출 — 이 파일만 신원 정보 포함.
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
        $pdo = getDB();
        $stmt = $pdo->query("
            SELECT id, user_id, author_name, author_email, author_phone,
                   gender, age_group, rating, content, is_admin_created, created_at, updated_at
            FROM reviews
            ORDER BY created_at DESC
        ");
        $rows = $stmt->fetchAll();
    } catch (Throwable $e) {
        error_log('[admin/reviews GET] ' . $e->getMessage());
        jsonOut(['ok' => false, 'reviews' => []]);
    }
    jsonOut(['ok' => true, 'reviews' => $rows]);
}

if ($method !== 'POST') jsonFail('method not allowed', 405);

$body   = jsonBody();
$action = (string)($body['action'] ?? '');
$GENDERS = ['남성', '여성'];

try {
    $pdo = getDB();

    if ($action === 'create') {
        $gender   = (string)($body['gender'] ?? '');
        $ageGroup = trim((string)($body['age_group'] ?? ''));
        $rating   = (int)($body['rating'] ?? 0);
        $content  = trim((string)($body['content'] ?? ''));

        if (!in_array($gender, $GENDERS, true)) jsonFail('성별을 선택해주세요.');
        if ($ageGroup === '') jsonFail('나이대를 입력해주세요.');
        if ($rating < 1 || $rating > 5) jsonFail('별점은 1~5 사이여야 합니다.');
        if ($content === '') jsonFail('내용을 입력해주세요.');
        if (mb_strlen($content) > 1000) jsonFail('내용이 너무 깁니다. (최대 1000자)');

        $stmt = $pdo->prepare("
            INSERT INTO reviews (user_id, author_name, author_email, author_phone, gender, age_group, rating, content, is_admin_created)
            VALUES (NULL, NULL, NULL, NULL, ?, ?, ?, ?, 1)
        ");
        $stmt->execute([$gender, $ageGroup, $rating, $content]);
        $newId = (int)$pdo->lastInsertId();

        logAdminActivity('create', 'review', (string)$newId, "후기 직접 등록 — {$gender}/{$ageGroup}", null,
            ['gender' => $gender, 'age_group' => $ageGroup, 'rating' => $rating]);

        jsonOut(['ok' => true, 'id' => $newId]);
    }

    if ($action === 'update') {
        $id       = (int)($body['id'] ?? 0);
        $gender   = (string)($body['gender'] ?? '');
        $ageGroup = trim((string)($body['age_group'] ?? ''));
        $rating   = (int)($body['rating'] ?? 0);
        $content  = trim((string)($body['content'] ?? ''));

        if ($id <= 0) jsonFail('잘못된 요청입니다.');
        if (!in_array($gender, $GENDERS, true)) jsonFail('성별을 선택해주세요.');
        if ($ageGroup === '') jsonFail('나이대를 입력해주세요.');
        if ($rating < 1 || $rating > 5) jsonFail('별점은 1~5 사이여야 합니다.');
        if ($content === '') jsonFail('내용을 입력해주세요.');
        if (mb_strlen($content) > 1000) jsonFail('내용이 너무 깁니다. (최대 1000자)');

        $stmt = $pdo->prepare("SELECT id FROM reviews WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) jsonFail('후기를 찾을 수 없습니다.', 404);

        $stmt = $pdo->prepare("UPDATE reviews SET gender = ?, age_group = ?, rating = ?, content = ? WHERE id = ?");
        $stmt->execute([$gender, $ageGroup, $rating, $content, $id]);

        logAdminActivity('update', 'review', (string)$id, "후기 수정 — {$gender}/{$ageGroup}", null,
            ['gender' => $gender, 'age_group' => $ageGroup, 'rating' => $rating]);

        jsonOut(['ok' => true]);
    }

    if ($action === 'delete') {
        $id = (int)($body['id'] ?? 0);
        if ($id <= 0) jsonFail('잘못된 요청입니다.');

        $stmt = $pdo->prepare("SELECT id FROM reviews WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) jsonFail('후기를 찾을 수 없습니다.', 404);

        $pdo->prepare("DELETE FROM reviews WHERE id = ?")->execute([$id]);

        logAdminActivity('delete', 'review', (string)$id, "후기 삭제", null, null);

        jsonOut(['ok' => true]);
    }

    jsonFail('unknown action');
} catch (Throwable $e) {
    error_log('[admin/reviews POST] ' . $e->getMessage());
    jsonFail('처리 중 오류가 발생했습니다.', 500);
}
