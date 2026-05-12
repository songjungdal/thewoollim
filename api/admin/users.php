<?php
/**
 * 관리자 회원 관리.
 *
 * GET  → { ok: true, users: [...] }
 *  · DB 활성 회원 전체 (id, email, name, gender, phone, mbti, birth_date, marital_status,
 *    location, job, interests, idealType, sns_provider, role, created_at)
 *  · 휴대폰 번호 자동 하이픈 포맷팅 (lib.formatPhone)
 *
 * POST { action: 'delete', email } → { ok: true }
 *  · 관리자 전용 — 일반 admin 계정은 삭제하지 않음
 *  · users.status='withdrawn', 익명화 + 관련 파일(bookings/cart/profile JSON) 정리
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
            SELECT id, email, name, gender, phone, mbti, location, job, interests,
                   ideal_type AS idealType, marital_status,
                   DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date,
                   sns_provider, role, status,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
            FROM users
            WHERE status = 'active'
            ORDER BY id DESC
        ");
        $users = $stmt->fetchAll();
    } catch (Throwable $e) {
        error_log('[admin/users GET] ' . $e->getMessage());
        echo json_encode(['ok' => false, 'users' => []]); exit;
    }

    foreach ($users as &$u) {
        $u['phone'] = $u['phone'] !== null ? formatPhone((string)$u['phone']) : '';
    }
    unset($u);

    echo json_encode(['ok' => true, 'users' => $users], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $body   = jsonBody();
    $action = (string)($body['action'] ?? '');
    $email  = normalizeEmail((string)($body['email'] ?? ''));

    if ($action !== 'delete') jsonFail('unknown action');
    if ($email === '') jsonFail('email required');

    try {
        $pdo  = getDB();
        $stmt = $pdo->prepare("SELECT id, role FROM users WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $u = $stmt->fetch();
        if (!$u) jsonFail('회원을 찾을 수 없습니다.', 404);
        if ($u['role'] === 'admin') jsonFail('관리자 계정은 삭제할 수 없습니다.', 403);

        $userId    = (int)$u['id'];
        $anonEmail = 'deleted_' . $userId . '_' . bin2hex(random_bytes(4)) . '@withdrawn.local';

        $stmt = $pdo->prepare("
            UPDATE users
               SET status='withdrawn', withdrawn_at=NOW(),
                   name='탈퇴회원', nickname=NULL, phone=NULL,
                   sns_user_id=NULL, sns_access_token=NULL,
                   email=?
             WHERE id=?
        ");
        $stmt->execute([$anonEmail, $userId]);

        // 관련 파일 정리 (best-effort)
        $dir  = dataDir();
        $hash = md5($email);
        @unlink($dir . '/bookings_' . $hash . '.json');
        @unlink($dir . '/cart_'     . $hash . '.json');
        @unlink($dir . '/profile_'  . $hash . '.json');

        @file_put_contents(
            $dir . '/_admin_user_deletions.log',
            sprintf("[%s] adminId=%s userId=%d originalEmail=%s\n",
                date('c'), $_SESSION['adminId'] ?? '?', $userId, $email),
            FILE_APPEND
        );

        logAdminActivity('delete', 'user', $email, "회원 삭제 (익명화) — userId={$userId}", null, null);
    } catch (Throwable $e) {
        error_log('[admin/users POST] ' . $e->getMessage());
        jsonFail('처리 중 오류', 500);
    }

    jsonOut(['ok' => true]);
}

jsonFail('method not allowed', 405);
