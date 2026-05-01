<?php
/**
 * 신규 가입자 필수 프로필 5종 입력.
 *  - register.php 직후, 메인 페이지에서 isCoreProfileComplete=false 면 /onboarding 으로 자동 이동
 *  - 한 번 입력 후 read-only — 변경은 관리자 문의 필요 (회원 본인 일방 수정 차단)
 *
 * POST { email, name, gender, phone, birthDate, maritalStatus } → { ok: true }
 *  - email          : 세션과 일치해야 함
 *  - gender         : '남성' | '여성'
 *  - phone          : '010-0000-0000' 포맷 (3-4-4)
 *  - birthDate      : 'YYYY-MM-DD'
 *  - maritalStatus  : '싱글' | '돌싱'
 *
 * 처리:
 *  - 기존 row 의 빈 핵심 5종만 UPDATE — 이미 채워진 값은 거부 (재입력 차단)
 *  - 핵심 5종이 이미 모두 채워져있으면 idempotent ok 반환
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body          = jsonBody();
$email         = normalizeEmail((string)($body['email'] ?? ''));
requireUser($email);

$name          = trim((string)($body['name']          ?? ''));
$gender        = (string)     ($body['gender']        ?? '');
$phone         = (string)     ($body['phone']         ?? '');
$birthDate     = (string)     ($body['birthDate']     ?? '');
$maritalStatus = (string)     ($body['maritalStatus'] ?? '');

if ($name === '' || mb_strlen($name) > 50)         jsonFail('이름을 1~50자 이내로 입력해주세요.');
if ($gender !== '남성' && $gender !== '여성')        jsonFail('성별을 선택해주세요.');
if (!preg_match('/^\d{3}-\d{4}-\d{4}$/', $phone))   jsonFail('연락처를 010-0000-0000 형식으로 입력해주세요.');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthDate) || !strtotime($birthDate)) {
    jsonFail('생년월일이 올바르지 않습니다.');
}
if ($maritalStatus !== '싱글' && $maritalStatus !== '돌싱') jsonFail('혼인여부를 선택해주세요.');

try {
    $pdo  = getDB();
    $stmt = $pdo->prepare("SELECT id, name, gender, phone, birth_date, marital_status FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $u = $stmt->fetch();
    if (!$u) jsonFail('회원 정보를 찾을 수 없습니다.', 404);

    // 이미 5종 모두 채워져있으면 idempotent
    $alreadyComplete =
        trim((string)$u['name'])   !== '' &&
        ($u['gender'] === '남성' || $u['gender'] === '여성') &&
        trim((string)$u['phone']) !== '' &&
        !empty($u['birth_date']) &&
        ($u['marital_status'] === '싱글' || $u['marital_status'] === '돌싱');

    if ($alreadyComplete) jsonOut(['ok' => true, 'alreadyComplete' => true]);

    // 비어있는 필드만 채움 — 한 번 채워진 값은 보존
    $set    = [];
    $params = [];
    if (trim((string)$u['name']) === '')                                                  { $set[] = "name = ?";           $params[] = $name; }
    if ($u['gender'] !== '남성' && $u['gender'] !== '여성')                               { $set[] = "gender = ?";         $params[] = $gender; }
    if (trim((string)$u['phone']) === '')                                                 { $set[] = "phone = ?";          $params[] = $phone; }
    if (empty($u['birth_date']))                                                          { $set[] = "birth_date = ?";     $params[] = $birthDate; }
    if ($u['marital_status'] !== '싱글' && $u['marital_status'] !== '돌싱')               { $set[] = "marital_status = ?"; $params[] = $maritalStatus; }

    if (empty($set)) jsonOut(['ok' => true, 'alreadyComplete' => true]);

    $params[] = $email;
    $sql = "UPDATE users SET " . implode(", ", $set) . " WHERE email = ?";
    $pdo->prepare($sql)->execute($params);
} catch (PDOException $e) {
    if ((int)$e->errorInfo[1] === 1062) {
        jsonFail('이미 등록된 휴대폰 번호입니다.', 409);
    }
    error_log('[onboarding] ' . $e->getMessage());
    jsonFail('저장 중 오류가 발생했습니다.', 500);
}

jsonOut(['ok' => true]);
