<?php
/**
 * 관리자 로그아웃.
 * POST/GET → 세션 파괴 + 쿠키 만료
 */
declare(strict_types=1);
require_once __DIR__ . '/_session.php';
adminJsonHeaders();

if (adminIsLoggedIn()) {
    logAdminActivity('logout', 'session', (string)($_SESSION['adminId'] ?? '?'), "관리자 로그아웃");
}

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

echo json_encode(['ok' => true]);
