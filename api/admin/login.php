<?php
/**
 * 관리자 로그인 (DB 기반).
 *
 * POST { id, password }
 *   - id 는 admin 계정의 로컬 식별자 (예: admin9921)
 *   - 내부 매핑: email = "{id}@woollim.local"
 *   - users 테이블에서 role='admin' AND status='active' 인 행만 인증 통과
 *
 * 응답:
 *   200 { ok: true, id }     세션 쿠키 WOOLLIM_ADMIN 발급
 *   400 { ok: false, error } 입력 부족
 *   401 { ok: false, error } 자격 불일치
 *   429 { ok: false, error } rate limit
 *   500 { ok: false, error } DB 오류
 *
 * 신규 관리자 추가:
 *   1) php -r 'echo password_hash("새비밀번호", PASSWORD_BCRYPT);'
 *   2) sudo mysql lampdb -e "INSERT INTO users (email,password_hash,name,phone,marital_status,status,role)
 *        VALUES ('admin####@woollim.local','<HASH>','관리자####','010-0000-####','','active','admin');"
 */

declare(strict_types=1);
require_once __DIR__ . '/_session.php';
require_once __DIR__ . '/../db.php';
adminJsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method not allowed']);
    exit;
}

$body = adminJsonBody();
$id   = trim((string)($body['id']       ?? ''));
$pw   = (string)        ($body['password'] ?? '');

if ($id === '' || $pw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => '아이디와 비밀번호를 입력해주세요.']);
    exit;
}
// 보안 — 공격 표면 축소: 식별자에 영숫자·언더스코어·하이픈만 허용
if (!preg_match('/^[A-Za-z0-9_-]{2,32}$/', $id)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => '아이디 형식이 올바르지 않습니다.']);
    exit;
}

// 짧은 rate limit (세션 단위 — 5회 실패 후 60초 차단)
$now  = time();
$gate = $_SESSION['_loginGate'] ?? ['fails' => 0, 'until' => 0];
if (($gate['until'] ?? 0) > $now) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => '잠시 후 다시 시도해주세요.']);
    exit;
}

$email = $id . '@woollim.local';

try {
    $pdo  = getDB();
    $stmt = $pdo->prepare(
        "SELECT id, email, name, password_hash, role, status
           FROM users
          WHERE email = ? AND role = 'admin' AND status = 'active'
          LIMIT 1"
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch();
} catch (Throwable $e) {
    @file_put_contents(
        dirname(__DIR__) . '/data/_admin_login_db_error.log',
        sprintf("[%s] %s\n", date('c'), $e->getMessage()),
        FILE_APPEND
    );
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => '서버 오류 — 잠시 후 다시 시도해주세요.']);
    exit;
}

$pwOk = $user && password_verify($pw, (string)$user['password_hash']);

if (!$pwOk) {
    $gate['fails'] = (int)($gate['fails'] ?? 0) + 1;
    if ($gate['fails'] >= 5) {
        $gate['until'] = $now + 60;
        $gate['fails'] = 0;
    }
    $_SESSION['_loginGate'] = $gate;

    @file_put_contents(
        dirname(__DIR__) . '/data/_admin_login_fail.log',
        sprintf("[%s] FAIL id=%s ip=%s\n",
            date('c'), $id, $_SERVER['REMOTE_ADDR'] ?? '-'),
        FILE_APPEND
    );

    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => '아이디 또는 비밀번호가 일치하지 않습니다.']);
    exit;
}

// 성공 — 세션 고정 방지 위해 ID 회전
session_regenerate_id(true);
$_SESSION['admin']      = true;
$_SESSION['adminId']    = $id;
$_SESSION['adminUserId']= (int)$user['id'];
$_SESSION['adminName']  = $user['name'];
$_SESSION['loggedInAt'] = $now;
unset($_SESSION['_loginGate']);

@file_put_contents(
    dirname(__DIR__) . '/data/_admin_login_success.log',
    sprintf("[%s] OK id=%s userId=%d ip=%s\n",
        date('c'), $id, $user['id'], $_SERVER['REMOTE_ADDR'] ?? '-'),
    FILE_APPEND
);

echo json_encode(['ok' => true, 'id' => $id, 'name' => $user['name']]);
