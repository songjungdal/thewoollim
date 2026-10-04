<?php
/**
 * 로그인한 회원의 비밀번호 변경 (마이페이지 → [비밀번호 변경]).
 *
 * POST { currentPassword, newPassword } → 200 { ok: true }
 *                                         400 { ok: false, error }  입력 오류 / 현재 비밀번호 불일치 / SNS 전용 계정
 *                                         401 { ok: false, error }  비로그인
 *                                         404 { ok: false, error }  회원 없음
 *
 * 대상: 세션 회원(role='user', status='active'). 관리자 세션은 이 엔드포인트를 쓸 수 없다.
 * 새 비밀번호는 회원가입과 동일하게 8자 이상. 성공 시 세션 ID를 교체한다.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);
requireUser();

$body    = jsonBody();
$current = (string)($body['currentPassword'] ?? '');
$next    = (string)($body['newPassword']     ?? '');

if ($current === '' || $next === '') jsonFail('현재 비밀번호와 새 비밀번호를 입력해주세요.');
if (strlen($next) < 8)               jsonFail('새 비밀번호는 8자 이상이어야 합니다.');
if ($current === $next)              jsonFail('현재 비밀번호와 다른 비밀번호를 입력해주세요.');

try {
    $pdo  = getDB();
    $stmt = $pdo->prepare("
        SELECT id, email, password_hash FROM users
         WHERE id = ? AND status = 'active' AND role = 'user'
         LIMIT 1
    ");
    $stmt->execute([currentUserId()]);
    $user = $stmt->fetch();
} catch (Throwable $e) {
    error_log('[auth/change-password] DB ' . $e->getMessage());
    jsonFail('서버 오류 — 잠시 후 다시 시도해주세요.', 500);
}

if (!$user) jsonFail('회원 정보를 찾을 수 없습니다.', 404);

if (trim((string)$user['password_hash']) === '') {
    jsonFail('소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.');
}
if (!password_verify($current, (string)$user['password_hash'])) {
    jsonFail('현재 비밀번호가 일치하지 않습니다.');
}

try {
    $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?")
        ->execute([password_hash($next, PASSWORD_BCRYPT), (int)$user['id']]);
} catch (Throwable $e) {
    error_log('[auth/change-password] UPDATE ' . $e->getMessage());
    jsonFail('서버 오류 — 잠시 후 다시 시도해주세요.', 500);
}

session_regenerate_id(true);

@file_put_contents(
    dataDir() . '/_user_password_change.log',
    sprintf("[%s] CHANGED userId=%d email=%s ip=%s\n",
        date('c'), (int)$user['id'], $user['email'], $_SERVER['REMOTE_ADDR'] ?? '-'),
    FILE_APPEND
);

echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
