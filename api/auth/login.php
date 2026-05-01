<?php
/**
 * 일반 회원 이메일/비밀번호 로그인.
 *
 * POST { email, password } → { ok: true, email, isProfileComplete, redirect? }
 *  - DB users 테이블에서 status='active' AND role='user' 인 행만 인증 통과
 *    (관리자(role='admin') 는 /admin8888/ 전용 — 본 엔드포인트로 절대 통과 못 함)
 *  - bcrypt password_verify, hash_equals 상수시간 비교
 *  - 세션 고정 방지 (session_regenerate_id)
 *
 * 응답:
 *   200 { ok: true, email }                                  세션 쿠키 WOOLLIM_USER 발급
 *   400 { ok: false, error }                                 입력 부족/형식 오류
 *   401 { ok: false, error: '아이디 또는 비밀번호가...' }    자격 불일치 / SNS 전용 / withdrawn
 *   429 { ok: false, error: '잠시 후...' }                   rate limit
 *   500 { ok: false, error }                                 DB 오류
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body     = jsonBody();
$email    = normalizeEmail((string)($body['email']    ?? ''));
$password = (string)            ($body['password'] ?? '');

if ($email === '' || $password === '') {
    jsonFail('이메일과 비밀번호를 입력해주세요.');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonFail('이메일 형식이 올바르지 않습니다.');
}

// 세션 단위 rate limit (5회 실패 → 60초 차단)
$now  = time();
$gate = $_SESSION['_loginGate'] ?? ['fails' => 0, 'until' => 0];
if (($gate['until'] ?? 0) > $now) {
    jsonFail('잠시 후 다시 시도해주세요.', 429);
}

try {
    $pdo  = getDB();
    $stmt = $pdo->prepare("
        SELECT id, email, name, password_hash, role, status, sns_provider
          FROM users
         WHERE email = ? AND status = 'active' AND role = 'user'
         LIMIT 1
    ");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
} catch (Throwable $e) {
    error_log('[auth/login] DB ' . $e->getMessage());
    jsonFail('서버 오류 — 잠시 후 다시 시도해주세요.', 500);
}

// 동일한 401 응답으로 통일 (사용자 enumeration 방어)
$pwOk  = $user
      && !empty($user['password_hash'])
      && password_verify($password, (string)$user['password_hash']);

if (!$pwOk) {
    $gate['fails'] = (int)($gate['fails'] ?? 0) + 1;
    if ($gate['fails'] >= 5) {
        $gate['until'] = $now + 60;
        $gate['fails'] = 0;
    }
    $_SESSION['_loginGate'] = $gate;

    @file_put_contents(
        dataDir() . '/_user_login_fail.log',
        sprintf("[%s] FAIL email=%s ip=%s\n",
            date('c'), $email, $_SERVER['REMOTE_ADDR'] ?? '-'),
        FILE_APPEND
    );
    jsonFail('아이디 또는 비밀번호가 일치하지 않습니다.', 401);
}

// 성공 — 세션 발급
loginUserSession((int)$user['id'], (string)$user['email']);
unset($_SESSION['_loginGate']);

@file_put_contents(
    dataDir() . '/_user_login_success.log',
    sprintf("[%s] OK userId=%d email=%s ip=%s\n",
        date('c'), $user['id'], $email, $_SERVER['REMOTE_ADDR'] ?? '-'),
    FILE_APPEND
);

jsonOut([
    'ok'    => true,
    'email' => $user['email'],
    'name'  => $user['name'],
]);
