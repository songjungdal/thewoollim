<?php
/**
 * 회원 프로필 조회/저장 (DB).
 *
 * GET ?email=<x>  → Profile shape (Profile 타입 from AuthContext.tsx)
 *   { name, gender, phone, location, job, mbti, birthDate, interests, idealType, maritalStatus }
 *
 * POST { email, profile: {...} } → { ok:true }
 *   - 핵심 5종(name/gender/phone/birthDate/maritalStatus) 잠금:
 *     이미 채워진 값은 보존 (회원 본인 일방 수정 차단). 변경은 관리자 경유.
 *   - 보조 5종(location/job/mbti/interests/idealType) 자유 갱신.
 *
 * 본인 데이터만 접근 — email 파라미터가 세션 이메일과 일치해야 함.
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth/_session.php';
jsonHeaders();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $email = normalizeEmail((string)($_GET['email'] ?? ''));
    if ($email === '') jsonOut(null);
    requireUser($email);

    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("
            SELECT name, gender, phone, location, job, mbti,
                   DATE_FORMAT(birth_date, '%Y-%m-%d') AS birthDate,
                   interests, ideal_type AS idealType, marital_status AS maritalStatus
            FROM users WHERE email = ? AND status='active' LIMIT 1
        ");
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        if (!$row) jsonOut(null);

        jsonOut([
            'name'          => (string)($row['name']      ?? ''),
            'gender'        => (string)($row['gender']    ?? ''),
            'phone'         => (string)($row['phone']     ?? ''),
            'location'      => (string)($row['location']  ?? ''),
            'job'           => (string)($row['job']       ?? ''),
            'mbti'          => (string)($row['mbti']      ?? ''),
            'birthDate'     => (string)($row['birthDate'] ?? ''),
            'interests'     => (string)($row['interests'] ?? ''),
            'idealType'     => (string)($row['idealType'] ?? ''),
            'maritalStatus' => (string)($row['maritalStatus'] ?? ''),
        ]);
    } catch (Throwable $e) {
        error_log('[profile GET] ' . $e->getMessage());
        jsonOut(null);
    }
}

if ($method === 'POST') {
    $body  = jsonBody();
    $email = normalizeEmail((string)($body['email'] ?? ''));
    requireUser($email);

    $p = is_array($body['profile'] ?? null) ? $body['profile'] : [];

    $name          = trim((string)($p['name']          ?? ''));
    $gender        = (string)     ($p['gender']        ?? '');
    $phone         = (string)     ($p['phone']         ?? '');
    $location      = trim((string)($p['location']      ?? ''));
    $job           = trim((string)($p['job']           ?? ''));
    $mbti          = strtoupper(trim((string)($p['mbti'] ?? '')));
    $birthDate     = (string)     ($p['birthDate']     ?? '');
    $interests     = (string)     ($p['interests']     ?? '');
    $idealType     = (string)     ($p['idealType']     ?? '');
    $maritalStatus = (string)     ($p['maritalStatus'] ?? '');

    // 보조 필드 검증
    if (mb_strlen($name)      > 50)   jsonFail('이름이 너무 깁니다.');
    if (mb_strlen($location)  > 100)  jsonFail('지역이 너무 깁니다.');
    if (mb_strlen($job)       > 100)  jsonFail('직업이 너무 깁니다.');
    if ($mbti !== '' && !preg_match('/^(I|E)(N|S)(F|T)(P|J)$/', $mbti)) {
        jsonFail('MBTI 형식이 올바르지 않습니다.');
    }

    try {
        $pdo  = getDB();
        $stmt = $pdo->prepare("SELECT name, gender, phone, birth_date, marital_status FROM users WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $cur = $stmt->fetch();
        if (!$cur) jsonFail('회원 정보를 찾을 수 없습니다.', 404);

        // 핵심 5종 잠금 — 이미 채워졌으면 입력 무시
        $applyName     = trim((string)$cur['name']) === ''       ? $name      : $cur['name'];
        $applyGender   = ($cur['gender'] === '남성' || $cur['gender'] === '여성') ? $cur['gender'] : $gender;
        $applyPhone    = trim((string)$cur['phone']) === ''      ? $phone     : $cur['phone'];
        $applyBirth    = empty($cur['birth_date'])               ? $birthDate : $cur['birth_date'];
        $applyMarital  = ($cur['marital_status'] === '미혼' || $cur['marital_status'] === '돌싱')
                         ? $cur['marital_status'] : $maritalStatus;

        // 입력값 자체 검증 (잠긴 필드는 cur 사용이라 검증 skip)
        if (trim((string)$applyName) === '') jsonFail('이름이 필요합니다.');

        $stmt = $pdo->prepare("
            UPDATE users SET
              name = ?, gender = ?, phone = ?,
              location = ?, job = ?, mbti = ?,
              birth_date = ?, interests = ?, ideal_type = ?, marital_status = ?
            WHERE email = ?
        ");
        $stmt->execute([
            $applyName, $applyGender, $applyPhone,
            $location, $job, $mbti,
            ($applyBirth ?: null),
            $interests, $idealType, $applyMarital,
            $email,
        ]);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) jsonFail('이미 사용 중인 정보입니다.', 409);
        error_log('[profile POST] ' . $e->getMessage());
        jsonFail('저장 중 오류', 500);
    }

    jsonOut(['ok' => true]);
}

jsonFail('method not allowed', 405);
