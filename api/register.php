<?php
/**
 * 일반 회원가입 (이메일/비밀번호 + SMS 인증완료 필수).
 *
 * POST { email, password, name, phone } → { ok: true }
 *  - 휴대폰은 숫자만 (10~11자리, 01 시작)
 *  - 비밀번호 8자 이상
 *  - 이메일 형식
 *  - 이름은 1~50자
 *
 * 사전조건:
 *  - 동일 브라우저 세션에서 verify-sms.php 성공해 verifiedPhone 일치 + 30분 이내
 *
 * 처리:
 *  1) DB 중복 검사 (email/phone)
 *  2) bcrypt 해싱
 *  3) users 테이블 INSERT
 *  4) WOOLLIM_USER 세션 발급 → 메인 진입 시 AuthContext 자동 인지
 *  5) 사용한 sms_<hash>.json 정리
 *
 * 실패: 400 / 409 / 500 + { ok:false, error }
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body     = jsonBody();
$email    = normalizeEmail((string)($body['email']    ?? ''));
$password = (string)            ($body['password'] ?? '');
$name     = trim((string)       ($body['name']     ?? ''));
$phone    = preg_replace('/\D+/', '', (string)($body['phone'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL))                  jsonFail('이메일 형식이 올바르지 않습니다.');
if (strlen($password) < 8)                                       jsonFail('비밀번호는 8자 이상이어야 합니다.');
if ($name === '' || mb_strlen($name) > 50)                       jsonFail('이름을 1~50자 이내로 입력해주세요.');
if (!preg_match('/^01\d{8,9}$/', $phone))                        jsonFail('휴대폰 번호 형식이 올바르지 않습니다.');

// SMS 인증 검증 (세션 + 30분)
$vPhone = (string)($_SESSION['verifiedPhone']   ?? '');
$vAt    = (int)   ($_SESSION['verifiedPhoneAt'] ?? 0);
if ($vPhone !== $phone || $vAt === 0 || (time() - $vAt) > 1800) {
    jsonFail('휴대폰 본인인증을 먼저 완료해주세요.', 401);
}

// canonical 저장 형식: 하이픈 포함 (관리자 페이지 표시용 일관성)
$phoneCanonical = formatPhone($phone);

try {
    $pdo = getDB();

    // 중복 검사 — UNIQUE 제약으로 race도 방어되지만 친절한 메시지 위해 선검사
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    if ($stmt->fetch()) jsonFail('이미 가입된 이메일입니다.', 409);

    $stmt = $pdo->prepare("SELECT id FROM users WHERE REPLACE(REPLACE(phone,'-',''),' ','') = ? LIMIT 1");
    $stmt->execute([$phone]);
    if ($stmt->fetch()) jsonFail('이미 가입된 휴대폰 번호입니다.', 409);

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("
        INSERT INTO users (email, password_hash, name, phone, marital_status, status, role)
        VALUES (?, ?, ?, ?, '', 'active', 'user')
    ");
    $stmt->execute([$email, $hash, $name, $phoneCanonical]);
    $userId = (int)$pdo->lastInsertId();
} catch (PDOException $e) {
    if ((int)$e->errorInfo[1] === 1062) {
        jsonFail('이미 가입된 정보가 있습니다.', 409);
    }
    error_log('[register] ' . $e->getMessage());
    jsonFail('가입 처리 중 오류가 발생했습니다.', 500);
}

// 세션 발급
loginUserSession($userId, $email);

// 인증 정보 정리
unset($_SESSION['verifiedPhone'], $_SESSION['verifiedPhoneAt']);
@unlink(dataDir() . '/sms_' . md5($phone) . '.json');

@file_put_contents(
    dataDir() . '/_register.log',
    sprintf("[%s] OK userId=%d email=%s phone=%s ip=%s\n",
        date('c'), $userId, $email, $phone, $_SERVER['REMOTE_ADDR'] ?? '-'),
    FILE_APPEND
);

jsonOut(['ok' => true, 'email' => $email]);
