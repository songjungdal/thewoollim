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
        // 단, 테스트 회원(a/b 시리즈)은 잠금 우회 → 자유 수정 허용
        $bypass = isTestUser($email);
        $applyName     = $bypass || trim((string)$cur['name']) === ''                        ? $name      : $cur['name'];
        $applyGender   = $bypass || !($cur['gender'] === '남성' || $cur['gender'] === '여성') ? $gender    : $cur['gender'];
        $applyPhone    = $bypass || trim((string)$cur['phone']) === ''                       ? $phone     : $cur['phone'];
        $applyBirth    = $bypass || empty($cur['birth_date'])                                ? $birthDate : $cur['birth_date'];
        $applyMarital  = $bypass || !($cur['marital_status'] === '싱글' || $cur['marital_status'] === '돌싱')
                         ? $maritalStatus : $cur['marital_status'];

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

    // ── 프로필 필수 항목 전수 검증 → 예약 자동 상태 전환 (paid → pending) ─────────
    //  필수: 이름·성별·연락처·생년월일·혼인여부·직업·MBTI·관심사 가 모두 채워졌는지 확인.
    //  (DB에 nickname 컬럼은 없음 — 프로필 카드 완성 필드 전체를 기준으로 검사)
    //  모두 충족 시: 'paid_pending_profile'(결제완료/프로필대기) booking 을 'pending_approval'(확정 대기 중)로 일괄 전환.
    //  하나라도 미입력이면 기존 'paid_pending_profile' 유지. party_counts(인원)는 변경하지 않음.
    $profileComplete =
        trim((string)$applyName)    !== '' &&
        ($applyGender === '남성' || $applyGender === '여성') &&
        trim((string)$applyPhone)   !== '' &&
        !empty($applyBirth) &&
        ($applyMarital === '싱글' || $applyMarital === '돌싱') &&
        trim($job)        !== '' &&
        $mbti             !== '' &&
        trim((string)$interests) !== '';

    $advanced = false;
    if ($profileComplete) {
        $bf = dataDir() . '/bookings_' . md5(strtolower(trim($email))) . '.json';
        if (file_exists($bf)) {
            $bk = json_decode((string)file_get_contents($bf), true);
            if (is_array($bk)) {
                $changed = false;
                foreach ($bk as &$b) {
                    if (is_array($b) && (string)($b['status'] ?? '') === 'paid_pending_profile') {
                        $b['status']    = 'pending_approval';
                        $b['updatedAt'] = date('c');
                        $changed = true; $advanced = true;
                    }
                }
                unset($b);
                if ($changed) file_put_contents($bf, json_encode($bk, JSON_UNESCAPED_UNICODE));
            }
        }
    }

    jsonOut(['ok' => true, 'profileComplete' => $profileComplete, 'advanced' => $advanced]);
}

jsonFail('method not allowed', 405);
