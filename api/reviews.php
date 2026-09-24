<?php
/**
 * 후기게시판 — 공개 목록 조회 + 회원 작성/수정.
 *
 * GET                     → 공개 익명 목록 [{id, gender, age_group, rating, content, created_at}, ...]
 * GET ?mine=1 (세션 필요)  → { ok, validCount, myReviews:[{id,rating,content,created_at}] }
 *   - validCount: 본인의 유효 참가 이력(status ∈ confirmed/completed) 건수
 *   - myReviews : 본인이 작성한 후기 목록 (수정 대상 선택용)
 * POST { action:'create', rating, content } → 신규 작성
 *   - 참가 이력(validCount) > 이미 작성한 후기 수 여야 허용 (서버 재검증, authoritative)
 *   - 성별/나이대는 회원 프로필에서 자동 매핑해 저장
 * POST { action:'update', id, rating, content } → 본인이 쓴 후기만 수정 (성별/나이대는 유지)
 *
 * 개인정보: 공개 목록/본인 조회 응답 모두 user_id·author_name·author_email·author_phone 미노출.
 * 관리자용 전체 조회/직접 등록/타인 글 수정·삭제는 api/admin/reviews.php 에서만 수행.
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth/_session.php';
jsonHeaders();

/** 본인 bookings_<hash>.json 에서 유효 참가(참가확정/모임종료) 건수 카운트 */
function reviewsCountValidBookings(string $email): int {
    $bf = dataDir() . '/bookings_' . md5(strtolower(trim($email))) . '.json';
    if (!file_exists($bf)) return 0;
    $bookings = json_decode((string)file_get_contents($bf), true);
    if (!is_array($bookings)) return 0;
    $n = 0;
    foreach ($bookings as $b) {
        if (!is_array($b)) continue;
        if (in_array((string)($b['status'] ?? ''), ['confirmed', 'completed'], true)) $n++;
    }
    return $n;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if (isset($_GET['mine']) && $_GET['mine'] === '1') {
        requireUser();
        $userId = currentUserId();
        $email  = (string)currentUserEmail();

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare("SELECT id, rating, content, created_at FROM reviews WHERE user_id = ? ORDER BY created_at DESC");
            $stmt->execute([$userId]);
            $mine = $stmt->fetchAll();
        } catch (Throwable $e) {
            error_log('[reviews GET mine] ' . $e->getMessage());
            jsonOut(['ok' => false, 'error' => '조회 실패']);
        }

        jsonOut([
            'ok'         => true,
            'validCount' => reviewsCountValidBookings($email),
            'myReviews'  => $mine,
        ]);
    }

    try {
        $pdo = getDB();
        $stmt = $pdo->query("SELECT id, gender, age_group, rating, content, created_at FROM reviews ORDER BY created_at DESC");
        $rows = $stmt->fetchAll();
    } catch (Throwable $e) {
        error_log('[reviews GET] ' . $e->getMessage());
        jsonOut(['ok' => true, 'reviews' => []]);
    }
    jsonOut(['ok' => true, 'reviews' => $rows]);
}

if ($method !== 'POST') jsonFail('method not allowed', 405);

requireUser();
$userId = currentUserId();
$email  = (string)currentUserEmail();
$body   = jsonBody();
$action = (string)($body['action'] ?? '');

$rating  = (int)($body['rating'] ?? 0);
$content = trim((string)($body['content'] ?? ''));
if ($rating < 1 || $rating > 5) jsonFail('별점은 1~5 사이여야 합니다.');
if ($content === '') jsonFail('후기 내용을 입력해주세요.');
if (mb_strlen($content) > 1000) jsonFail('후기 내용이 너무 깁니다. (최대 1000자)');

try {
    $pdo = getDB();

    if ($action === 'create') {
        // 동시요청 경합(TOCTOU) 방지 — "이미 쓴 후기 수 확인 → 저장" 구간을 회원별
        // MySQL 네임드 락으로 직렬화. 락은 커넥션 종료(요청 종료) 시 자동 해제됨.
        $lockStmt = $pdo->prepare('SELECT GET_LOCK(?, 5) AS got');
        $lockStmt->execute(['reviews_create_user_' . $userId]);
        if (!(int)($lockStmt->fetch()['got'] ?? 0)) {
            jsonFail('처리 중입니다. 잠시 후 다시 시도해주세요.', 409);
        }

        $validCount = reviewsCountValidBookings($email);
        if ($validCount <= 0) {
            jsonFail('모임에 참가한 회원만 후기작성이 가능합니다.', 403);
        }

        $stmt = $pdo->prepare("SELECT COUNT(*) AS c FROM reviews WHERE user_id = ?");
        $stmt->execute([$userId]);
        $written = (int)($stmt->fetch()['c'] ?? 0);
        if ($written >= $validCount) {
            jsonFail('참가하신 모임 횟수만큼 후기 작성이 완료되었습니다. (작성하신 후기는 수정이 가능합니다.)', 409);
        }

        $stmt = $pdo->prepare("
            SELECT name, phone, gender, DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date
            FROM users WHERE id = ? AND status = 'active' LIMIT 1
        ");
        $stmt->execute([$userId]);
        $u = $stmt->fetch();
        if (!$u || empty($u['gender'])) jsonFail('프로필 정보(성별)가 필요합니다.', 400);

        $gender   = (string)$u['gender'];
        $ageGroup = $u['birth_date'] ? ageBand((string)$u['birth_date']) : '';
        if ($ageGroup === '') jsonFail('프로필 정보(생년월일)가 필요합니다.', 400);

        $stmt = $pdo->prepare("
            INSERT INTO reviews (user_id, author_name, author_email, author_phone, gender, age_group, rating, content, is_admin_created)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        ");
        $stmt->execute([$userId, (string)$u['name'], $email, (string)($u['phone'] ?? ''), $gender, $ageGroup, $rating, $content]);

        jsonOut(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
    }

    if ($action === 'update') {
        $id = (int)($body['id'] ?? 0);
        if ($id <= 0) jsonFail('잘못된 요청입니다.');

        $stmt = $pdo->prepare("SELECT user_id FROM reviews WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) jsonFail('후기를 찾을 수 없습니다.', 404);
        if ((int)($row['user_id'] ?? 0) !== $userId) jsonFail('본인이 작성한 후기만 수정할 수 있습니다.', 403);

        $stmt = $pdo->prepare("UPDATE reviews SET rating = ?, content = ? WHERE id = ?");
        $stmt->execute([$rating, $content, $id]);

        jsonOut(['ok' => true]);
    }

    jsonFail('unknown action');
} catch (Throwable $e) {
    error_log('[reviews POST] ' . $e->getMessage());
    jsonFail('처리 중 오류가 발생했습니다.', 500);
}
