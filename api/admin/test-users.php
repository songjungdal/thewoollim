<?php
/**
 * 관리자 [회원] 탭 — [테스트 회원 만들기].
 *
 * POST { password, emails? } → { ok: true, created: N, existing: N, createdEmails: [...] }
 *  · 관리자 세션 필수 (adminRequire)
 *  · 대상: 테스트 회원 이메일(api/lib.php isTestUser — a1~a20, b1~b20@naver.com)만.
 *    emails 를 보내지 않으면 전체(testUserEmails()), 보내면 그 목록만. 테스트 이메일이 아닌 값이 하나라도 있으면 전체 거절.
 *  · DB(users)에 같은 이메일 행이 있으면(상태 무관) 절대 건드리지 않고 "이미 있음"으로 센다.
 *  · 본인인증 없이 만드는 유일한 경로 — 그래서 테스트 이메일로만 제한한다.
 *  · 비밀번호: 회원가입(api/register.php)과 같은 규칙(8자 이상) · 같은 해시(password_hash BCRYPT).
 *    비밀번호 원문은 저장·로그·응답 어디에도 남기지 않는다.
 *
 * 만드는 내용 (번호 n):
 *  · a{n}: 남성 "테스트남{n}" / b{n}: 여성 "테스트여{n}"
 *  · 생년월일 1995-01-01, 혼인여부 싱글, role=user, status=active
 *  · 연락처: 010-0000-{a:1nnn / b:2nnn} — 실제 휴대폰에 배정되지 않는 010-0xxx 대역.
 *    이미 쓰는 번호면 가운데 자리를 1씩 올려 비어 있는 번호를 쓴다(기존 회원 번호와 중복 없음).
 *  · 프로필 카드: 직업 "테스트", MBTI, 관심사, 이상형, 지역 — 매칭파티 결제 후 바로 [확정 대기 중]
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body     = jsonBody();
$password = (string)($body['password'] ?? '');
if (strlen($password) < 8) jsonFail('비밀번호는 8자 이상이어야 합니다.');

// 대상 이메일 — 테스트 이메일만 허용 (본인인증 없이 만드는 경로라 서버에서 강제)
if (array_key_exists('emails', $body)) {
    if (!is_array($body['emails']) || count($body['emails']) === 0) jsonFail('emails 형식이 올바르지 않습니다.');
    $targets = [];
    foreach ($body['emails'] as $e) {
        $e = normalizeEmail((string)$e);
        if (!isTestUser($e)) jsonFail('테스트 회원 이메일(a1~a' . TEST_USER_MAX . ', b1~b' . TEST_USER_MAX . '@naver.com)만 만들 수 있습니다.', 403);
        $targets[$e] = true;
    }
    $targets = array_keys($targets);
} else {
    $targets = testUserEmails();
}

const TEST_USER_MBTI = ['ENFP', 'INFJ', 'ENTJ', 'ISTP', 'ESFJ', 'INTP', 'ESTJ', 'ISFP', 'ENTP', 'ISFJ'];
const TEST_USER_INTERESTS = ['여행,맛집,영화', '와인,카페,독서', '러닝,헬스,음악', '공연,전시회,사진', '요리,베이킹,등산'];

$created = [];
$existing = 0;

/** 관리자 활동 로그 — 만든 이메일과 개수만 (비밀번호는 기록하지 않음) */
function _testUsersLog(array $created, int $existing): void {
    if (!$created) return;
    logAdminActivity('create', 'user', 'test-users',
        '테스트 회원 만들기 — 새로 만듦 ' . count($created) . '개 / 이미 있음 ' . $existing . '개',
        null, ['created' => $created]);
}

try {
    $pdo  = getDB();
    $hash = password_hash($password, PASSWORD_BCRYPT);

    $findEmail = $pdo->prepare("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1");
    $findPhone = $pdo->prepare("SELECT id FROM users WHERE REPLACE(REPLACE(phone,'-',''),' ','') = ? LIMIT 1");
    $insert    = $pdo->prepare("
        INSERT INTO users (email, password_hash, name, phone, gender, birth_date, marital_status,
                           job, mbti, interests, ideal_type, location, status, role)
        VALUES (?, ?, ?, ?, ?, '1995-01-01', '싱글', '테스트', ?, ?, '테스트 이상형', '서울특별시 강남구', 'active', 'user')
    ");

    foreach ($targets as $email) {
        $findEmail->execute([$email]);
        if ($findEmail->fetch()) { $existing++; continue; }   // 이미 있는 계정은 건드리지 않음

        preg_match('/^([ab])(\d+)@/', $email, $m);
        $male = $m[1] === 'a';
        $n    = (int)$m[2];

        // 비어 있는 테스트 번호 찾기 (010-0000-1nnn → 010-0001-1nnn → …)
        $phone = null;
        for ($mid = 0; $mid < 100 && $phone === null; $mid++) {
            $cand = sprintf('010%04d%d%03d', $mid, $male ? 1 : 2, $n);
            $findPhone->execute([$cand]);
            if (!$findPhone->fetch()) $phone = $cand;
        }
        if ($phone === null) throw new RuntimeException("no free test phone for {$email}");

        try {
            $insert->execute([
                $email, $hash,
                ($male ? '테스트남' : '테스트여') . $n,
                formatPhone($phone),
                $male ? '남성' : '여성',
                TEST_USER_MBTI[($n - 1) % count(TEST_USER_MBTI)],
                TEST_USER_INTERESTS[($n - 1) % count(TEST_USER_INTERESTS)],
            ]);
            $created[] = $email;
        } catch (PDOException $e) {
            // 동시에 두 번 눌러 같은 이메일이 먼저 들어간 경우 → 이미 있음 (UNIQUE uk_email)
            $findEmail->execute([$email]);
            if ($findEmail->fetch()) { $existing++; continue; }
            throw $e;
        }
    }
} catch (Throwable $e) {
    error_log('[admin/test-users] ' . $e->getMessage());
    _testUsersLog($created, $existing);
    jsonFail('처리 중 오류가 발생했습니다.' . ($created ? ' (먼저 만든 ' . count($created) . '개는 저장됨)' : ''), 500);
}

_testUsersLog($created, $existing);

jsonOut([
    'ok'            => true,
    'created'       => count($created),
    'existing'      => $existing,
    'createdEmails' => $created,
]);
