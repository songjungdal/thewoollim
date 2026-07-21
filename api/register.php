<?php
/**
 * 일반 회원가입 (이메일/비밀번호 + 다날 본인인증 완료 필수).
 *
 * POST { email, password } → { ok: true }
 *  - 비밀번호 8자 이상
 *  - 이메일 형식
 *  - 이름/성별/연락처/생년월일은 클라이언트가 보내도 무시 — verify-identity.php 가
 *    세션에 저장한 검증값만 신뢰 (본인인증을 우회해 임의 값으로 가입하는 것을 차단)
 *
 * 사전조건:
 *  - 동일 브라우저 세션에서 verify-identity.php 성공해 verifiedIdentity 존재 + 30분 이내
 *  - 만 19세 미만은 verify-identity.php 단계에서 이미 차단되지만, 방어적으로 재검증
 *
 * 처리:
 *  1) DB 중복 검사 (email/phone)
 *  2) bcrypt 해싱
 *  3) users 테이블 INSERT (본인인증 검증된 이름/성별/연락처/생년월일 포함)
 *  4) WOOLLIM_USER 세션 발급 → 메인 진입 시 AuthContext 자동 인지
 *  5) 사용한 verifiedIdentity 세션 정리
 *
 * 실패: 400 / 401 / 403 / 409 / 500 + { ok:false, error }
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

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) jsonFail('이메일 형식이 올바르지 않습니다.');
if (strlen($password) < 8)                      jsonFail('비밀번호는 8자 이상이어야 합니다.');

// 다날 본인인증 검증 (세션 + 30분) — 이름/성별/연락처/생년월일의 유일한 출처
$verified = $_SESSION['verifiedIdentity']   ?? null;
$vAt      = (int)($_SESSION['verifiedIdentityAt'] ?? 0);
if (!is_array($verified) || $vAt === 0 || (time() - $vAt) > 1800) {
    jsonFail('본인인증을 먼저 완료해주세요.', 401);
}

$name       = trim((string)($verified['name']      ?? ''));
$gender     = (string)      ($verified['gender']    ?? '');
$birthDate  = (string)      ($verified['birthDate'] ?? '');
$phoneCanonical = (string)  ($verified['phone']     ?? '');
$phone      = preg_replace('/\D+/', '', $phoneCanonical);

if ($name === '' || $gender === '' || $birthDate === '' || !preg_match('/^01\d{8,9}$/', (string)$phone)) {
    jsonFail('본인인증 정보가 올바르지 않습니다. 본인인증을 다시 진행해주세요.', 401);
}

// 방어적 재검증 — verify-identity.php 에서 이미 차단되지만 우회 경로 원천 차단
if (calcAgeFromBirthDate($birthDate) < 19) {
    jsonFail('어울림 서비스는 만 19세 이상 성인만 이용 가능합니다.', 403);
}

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
        INSERT INTO users (email, password_hash, name, phone, gender, birth_date, marital_status, status, role)
        VALUES (?, ?, ?, ?, ?, ?, '', 'active', 'user')
    ");
    $stmt->execute([$email, $hash, $name, $phoneCanonical, $gender, $birthDate]);
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
unset($_SESSION['verifiedIdentity'], $_SESSION['verifiedIdentityAt']);

@file_put_contents(
    dataDir() . '/_register.log',
    sprintf("[%s] OK userId=%d email=%s phone=%s ip=%s\n",
        date('c'), $userId, $email, $phone, $_SERVER['REMOTE_ADDR'] ?? '-'),
    FILE_APPEND
);

jsonOut(['ok' => true, 'email' => $email]);
