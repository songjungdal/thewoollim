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

/**
 * 통합 관리자 활동 로그 기록.
 *  /api/data/admin_activity.json 에 append (flock 보호)
 *  → /api/admin/logs.php 가 읽어 dashboard "활동 로그" 탭에 노출
 *
 * @param string $action      'login'|'logout'|'login_fail'|'create'|'update'|'delete'|'view'
 * @param string $targetType  'booking'|'party'|'user'|'coupon'|'company'|'image'|'session'
 * @param string $targetId    대상 식별자 (예: bookingId, partyId, email)
 * @param string $summary     한글 한 줄 요약
 * @param mixed  $before      변경 전 값 (선택, JSON-encodable)
 * @param mixed  $after       변경 후 값 (선택, JSON-encodable)
 */
function logAdminActivity(
    string $action,
    string $targetType,
    string $targetId,
    string $summary,
    $before = null,
    $after  = null
): void {
    $file = __DIR__ . '/../data/admin_activity.json';
    $row = [
        'id'           => 0,                    // 저장 시 부여
        'created_at'   => date('Y-m-d H:i:s'),
        'admin_id'     => (string)($_SESSION['adminId'] ?? '?'),
        'ip'           => (string)($_SERVER['REMOTE_ADDR']     ?? '-'),
        'user_agent'   => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
        'action'       => $action,
        'target_type'  => $targetType,
        'target_id'    => $targetId,
        'summary'      => $summary,
        'before_value' => $before,
        'after_value'  => $after,
    ];

    $fp = @fopen($file, 'c+');
    if (!$fp) return;
    @flock($fp, LOCK_EX);
    $raw  = stream_get_contents($fp);
    $list = $raw ? json_decode($raw, true) : [];
    if (!is_array($list)) $list = [];

    $row['id'] = (int)(end($list)['id'] ?? 0) + 1;
    $list[] = $row;

    // 최대 5000건 유지 (오래된 것부터 trim)
    if (count($list) > 5000) {
        $list = array_slice($list, -5000);
    }

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($list, JSON_UNESCAPED_UNICODE));
    fflush($fp);
    @flock($fp, LOCK_UN);
    fclose($fp);
}
