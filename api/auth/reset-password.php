<?php
/**
 * 임시 비밀번호 발급 — 가입 시 등록한 휴대폰 번호로 임시 비밀번호를 SMS 발송하고 비밀번호를 교체.
 *
 * POST { email } → 200 { ok: true, maskedPhone }
 *                  400 { ok: false, error }   형식 오류 / SNS 전용 계정 / 휴대폰 미등록
 *                  403 { ok: false, error }   테스트·관리자 계정 (자동 문자 발송 제외 대상)
 *                  404 { ok: false, error }   일치 회원 없음
 *                  429 { ok: false, error }   같은 이메일 5분 내 재요청
 *                  500 { ok: false, error }   문자 발송 실패 또는 DB 오류 (비밀번호는 변경되지 않음)
 *
 * 처리 순서: 임시 비밀번호 생성 → 문자 발송 성공 확인 → 그 뒤에만 password_hash 갱신.
 * 발송이 실패하면 기존 비밀번호가 그대로 남아 회원이 잠기지 않는다.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body  = jsonBody();
$email = normalizeEmail((string)($body['email'] ?? ''));
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonFail('올바른 이메일 주소를 입력해주세요.');
}

$gateFile = dataDir() . '/_pw_reset_gate_' . md5($email) . '.txt';
if (is_file($gateFile) && (time() - (int)filemtime($gateFile)) < 300) {
    jsonFail('임시 비밀번호는 5분에 한 번만 요청할 수 있습니다. 잠시 후 다시 시도해주세요.', 429);
}
touch($gateFile);

try {
    $pdo  = getDB();
    $stmt = $pdo->prepare("
        SELECT id, email, phone, password_hash, role, status
          FROM users
         WHERE email = ? AND status = 'active' AND role = 'user'
         LIMIT 1
    ");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
} catch (Throwable $e) {
    error_log('[auth/reset-password] DB ' . $e->getMessage());
    jsonFail('서버 오류 — 잠시 후 다시 시도해주세요.', 500);
}

if (!$user) jsonFail('일치하는 회원 정보를 찾을 수 없습니다.', 404);

if (preg_match('/^[ab](?:[1-9]|10)@naver\.com$/', $email) || str_ends_with($email, '@woollim.local')) {
    jsonFail('이 계정은 임시 비밀번호 문자 발송 대상이 아닙니다.', 403);
}

if (trim((string)$user['password_hash']) === '') {
    jsonFail('소셜 로그인으로 가입된 계정입니다. 해당 간편 로그인을 이용해주세요.');
}

$phone = preg_replace('/\D+/', '', (string)($user['phone'] ?? ''));
if ($phone === '' || strlen($phone) < 10 || !str_starts_with($phone, '01')) {
    jsonFail('등록된 휴대폰 번호가 없어 임시 비밀번호를 발송할 수 없습니다. 고객센터로 문의해주세요.');
}

$alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
$tempPw = '';
for ($i = 0; $i < 10; $i++) {
    $tempPw .= $alphabet[random_int(0, strlen($alphabet) - 1)];
}

$cfg = require __DIR__ . '/sms-config.php';
$msg = "[어울림] 임시 비밀번호는 {$tempPw} 입니다. 로그인 후 반드시 비밀번호를 변경해주세요.";
$params = [
    'key'         => $cfg['apikey'],
    'user_id'     => $cfg['userid'],
    'sender'      => preg_replace('/\D+/', '', (string)$cfg['sender']),
    'receiver'    => $phone,
    'msg'         => $msg,
    'msg_type'    => strlen($msg) > 90 ? 'LMS' : 'SMS',
    'testmode_yn' => 'N',
];
if ($params['msg_type'] === 'LMS') $params['title'] = '[어울림] 임시 비밀번호 안내';

$ch = curl_init('https://apis.aligo.in/send/');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => http_build_query($params),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
]);
$resBody = curl_exec($ch);
$resJson = is_string($resBody) ? (json_decode($resBody, true) ?: []) : [];
$sent = (string)($resJson['result_code'] ?? '') === '1';

$maskedPhone = substr($phone, 0, 3) . '-****-' . substr($phone, -4);

@file_put_contents(dataDir() . '/_pw_reset.log', sprintf(
    "[%s] %s email=%s phone=%s\n",
    date('c'), $sent ? 'SENT' : 'SEND_FAIL', $email, $maskedPhone
), FILE_APPEND);

if (!$sent) jsonFail('문자 발송에 실패했습니다. 잠시 후 다시 시도해주세요.', 500);

try {
    $hash = password_hash($tempPw, PASSWORD_BCRYPT);
    $pdo->prepare("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?")
        ->execute([$hash, (int)$user['id']]);
} catch (Throwable $e) {
    error_log('[auth/reset-password] UPDATE ' . $e->getMessage());
    jsonFail('서버 오류 — 고객센터로 문의해주세요.', 500);
}

echo json_encode(['ok' => true, 'maskedPhone' => $maskedPhone], JSON_UNESCAPED_UNICODE);
