<?php
/**
 * 어울림 회원 세션 부트스트랩.
 * 모든 회원용 PHP (api/auth/*, api/profile.php, api/bookings.php …) 에서 require.
 *
 * 세션 저장 경로: /var/www/thewoollim/api/auth/sessions  (mode 770, www-data)
 * 쿠키 이름: WOOLLIM_USER  — 관리자(WOOLLIM_ADMIN) 와 분리해 동시 접속 무충돌
 * 보안: HttpOnly, Secure(HTTPS), SameSite=Lax
 */

declare(strict_types=1);

ini_set('session.save_path',  __DIR__ . '/sessions');
ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure',   '1');
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.cookie_lifetime', '2592000'); // 30일 — 브라우저 종료 후에도 세션 쿠키 유지.
                                               // (미설정 시 기본 0=임시쿠키 → 브라우저 닫으면 세션 소멸,
                                               //  프론트 localStorage 로그인 상태와 불일치해 결제 시 unauthorized 발생)
ini_set('session.gc_maxlifetime', '2592000'); // 30일

session_name('WOOLLIM_USER');
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function userIsLoggedIn(): bool {
    return !empty($_SESSION['userId']) && !empty($_SESSION['email']);
}

function currentUserEmail(): ?string {
    return userIsLoggedIn() ? (string)$_SESSION['email'] : null;
}

function currentUserId(): ?int {
    return userIsLoggedIn() ? (int)$_SESSION['userId'] : null;
}

/**
 * 호출자가 로그인 상태가 아니면 401 + 즉시 종료.
 *  email 파라미터가 들어오면 세션 이메일과 일치하는지 검증 (다른 회원 데이터 접근 차단).
 */
function requireUser(?string $emailParam = null): void {
    if (!userIsLoggedIn()) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'unauthorized']);
        exit;
    }
    if ($emailParam !== null) {
        $sess = strtolower((string)$_SESSION['email']);
        $req  = strtolower(trim($emailParam));
        if ($sess !== $req) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'forbidden']);
            exit;
        }
    }
}

function loginUserSession(int $userId, string $email): void {
    session_regenerate_id(true);
    $_SESSION['userId']     = $userId;
    $_SESSION['email']      = $email;
    $_SESSION['loggedInAt'] = time();
}

function logoutUserSession(): void {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $params['path']     ?? '/',
            'domain'   => $params['domain']   ?? '',
            'secure'   => $params['secure']   ?? true,
            'httponly' => $params['httponly'] ?? true,
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }
    session_destroy();
}
