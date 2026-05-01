<?php
/**
 * 어울림 관리자 세션 부트스트랩.
 * 모든 admin/*.php 에서 require 하여 동일한 세션 컨텍스트를 공유.
 *
 * 세션 저장 경로: /var/www/thewoollim/api/admin/sessions (mode 770, www-data 전용)
 * 쿠키 이름: WOOLLIM_ADMIN  — 공개 사이트 세션과 분리
 * 보안: HttpOnly, Secure(HTTPS), SameSite=Lax
 */

declare(strict_types=1);

ini_set('session.save_path',  __DIR__ . '/sessions');
ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure',   '1');
ini_set('session.cookie_samesite', 'Lax');

session_name('WOOLLIM_ADMIN');
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function adminJsonHeaders(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
}

function adminJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || $raw === '') return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function adminIsLoggedIn(): bool {
    return !empty($_SESSION['admin']) && $_SESSION['admin'] === true;
}

function adminRequire(): void {
    if (!adminIsLoggedIn()) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'unauthorized']);
        exit;
    }
}
