<?php
/**
 * 관리자 [회원 관리] 탭 — 테스트 회원 도구 (만들기 · 프로필 다시 섞기 · 삭제).
 *
 * 공통
 *  · 관리자 세션 필수 (adminRequire)
 *  · 대상은 테스트 회원 이메일(api/lib.php isTestUser — a1~a20, b1~b20@naver.com)뿐.
 *    emails 에 테스트 이메일이 아닌 값이 하나라도 있으면 요청 전체를 403 으로 거절한다.
 *
 * POST { action?: 'create', password, emails? } → { ok, created, existing, createdEmails }
 *  · action 을 생략하면 create (이전 버전과 같은 요청).
 *  · emails 를 보내지 않으면 전체(testUserEmails()). DB(users)에 같은 이메일 행이 있으면(상태 무관)
 *    절대 건드리지 않고 "이미 있음"으로 센다. 본인인증 없이 만드는 유일한 경로 — 그래서 테스트 이메일로만 제한.
 *  · 비밀번호: 회원가입(api/register.php)과 같은 규칙(8자 이상) · 같은 해시(password_hash BCRYPT).
 *    비밀번호 원문은 저장·로그·응답 어디에도 남기지 않는다.
 *  · 만드는 내용: a=남성 / b=여성, 이름(한국식 성+이름)·직업·생년월일(만 25~39세)·MBTI·관심사는 무작위
 *    (randomTestProfile), 혼인여부 싱글, 이상형·지역 고정값, role=user, status=active
 *    → 매칭파티 결제 후 바로 [확정 대기 중].
 *    연락처: 010-0000-{a:1nnn / b:2nnn} — 실제 휴대폰에 배정되지 않는 010-0xxx 대역.
 *    이미 쓰는 번호면 가운데 자리를 1씩 올려 비어 있는 번호를 쓴다(기존 회원 번호와 중복 없음).
 *
 * POST { action: 'shuffle' } → { ok, updated }
 *  · 활성 테스트 회원 전원의 이름·직업·생년월일·MBTI·관심사를 무작위 값으로 바꾼다.
 *    이메일·비밀번호·성별·연락처(그 밖의 컬럼도)는 바꾸지 않는다. 이름은 저장된 성별 기준.
 *
 * POST { action: 'check', emails } → { ok, members: [{ email, name, activeBookings }], activeBookings }
 *  · 삭제 전 확인용 — 취소되지 않은(status !== 'cancelled') 예약 건수.
 *
 * POST { action: 'delete', emails } → { ok, deleted, deletedEmails, cancelledBookings }
 *  · 활성 테스트 회원만 삭제. 방식은 기존 회원 삭제(api/admin/users.php)와 같다(익명화 + 관련 파일 정리).
 *    연락처는 NULL 로 지우되, DB 가 NULL 을 받지 않으면 'withdrawn-{id}' 로 지운다.
 *  · 익명화 뒤 취소되지 않은 예약을 기존 [취소](api/admin/bookings.php action=cancel) 규칙대로 정리한다:
 *    인원 -1(참가 구성 예약은 회차 인원도), 무통장 미입금 건은 차감 제외, 사용한 쿠폰 사용 이력 해제.
 *    (테스트 회원은 문자 발송 대상이 아니므로 취소 문자는 보내지 않는다.) 그 뒤 예약·장바구니·프로필 파일 삭제.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body   = jsonBody();
$action = (string)($body['action'] ?? 'create');
if (!in_array($action, ['create', 'shuffle', 'check', 'delete'], true)) jsonFail('unknown action');

/** 요청의 emails → 정규화된 테스트 이메일 목록. 테스트 이메일이 아닌 값이 있으면 403. */
function _testUsersTargets(array $body, bool $required): array {
    if (!array_key_exists('emails', $body)) {
        if ($required) jsonFail('emails 가 필요합니다.');
        return testUserEmails();
    }
    if (!is_array($body['emails']) || count($body['emails']) === 0) jsonFail('emails 형식이 올바르지 않습니다.');
    $targets = [];
    foreach ($body['emails'] as $e) {
        $e = normalizeEmail(is_string($e) ? $e : '');
        if (!isTestUser($e)) jsonFail('테스트 회원 이메일(a1~a' . TEST_USER_MAX . ', b1~b' . TEST_USER_MAX . '@naver.com)만 처리할 수 있습니다.', 403);
        $targets[$e] = true;
    }
    return array_keys($targets);
}

// ─── 무작위 프로필 ─────────────────────────────────────────────────
const TEST_SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍', '유', '고', '문', '양', '손', '배', '백', '허', '남', '노'];
const TEST_GIVEN_MALE = ['민준', '서준', '도윤', '예준', '시우', '주원', '하준', '지호', '준서', '건우', '현우', '우진', '지훈', '선우', '연우', '유준', '정우', '승우', '승현', '시윤',
                         '준혁', '은우', '지환', '승민', '지우', '민재', '현준', '태윤', '동현', '성민', '재원', '상훈', '영호', '경민', '진우', '태현', '준영', '민석', '형준', '재현'];
const TEST_GIVEN_FEMALE = ['서연', '서윤', '지우', '서현', '민서', '하은', '하윤', '윤서', '지유', '지민', '채원', '수아', '지아', '다은', '은서', '예은', '수빈', '소율', '예린', '지원',
                           '유진', '민지', '수연', '혜원', '지현', '은지', '현정', '보람', '소연', '미영', '지은', '하린', '나연', '다현', '세영', '가은', '예지', '수진', '은비', '연주'];
const TEST_JOBS = ['회사원', '공무원', '교사', '간호사', '개발자', '디자이너', '마케터', '회계사', '연구원', '약사', '은행원', '엔지니어', '기획자', '영업직', '프리랜서',
                   '자영업', '물리치료사', '변호사', '세무사', '건축가', '승무원', '사회복지사', '대학원생', '영양사', '컨설턴트'];
const TEST_MBTI = ['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'];
// 프로필 카드 관심사 태그와 같은 목록·순서 (app/profile-setup/page.tsx INTEREST_TAGS)
const TEST_INTEREST_TAGS = ['결혼', '연애', '와인', '위스키', '맛집', '요리', '베이킹', '카페', '여행', '독서', '영화', '공연',
                            '전시회', '사진', '음악', '패션', '골프', '테니스', '러닝', '필라테스', '요가', '헬스', '등산', '자전거'];

/**
 * 무작위 프로필 — name·job·birth_date(만 25~39세, KST 오늘 기준)·mbti·interests(태그 3개, 태그 목록 순서).
 * $usedNames 에 있는 이름은 가능한 한 피한다(한 번의 요청 안에서 겹치지 않게).
 */
function randomTestProfile(bool $male, array &$usedNames): array {
    $given = $male ? TEST_GIVEN_MALE : TEST_GIVEN_FEMALE;
    for ($try = 0; $try < 50; $try++) {
        $name = TEST_SURNAMES[random_int(0, count(TEST_SURNAMES) - 1)] . $given[random_int(0, count($given) - 1)];
        if (!isset($usedNames[$name])) break;
    }
    $usedNames[$name] = true;

    $today  = new DateTimeImmutable('now', new DateTimeZone('Asia/Seoul'));
    $oldest = $today->modify('-40 years')->modify('+1 day');   // 만 39세의 마지막 날
    $newest = $today->modify('-25 years');                     // 만 25세가 되는 날
    $days   = (int)$oldest->diff($newest)->days;
    $birth  = $oldest->modify('+' . random_int(0, $days) . ' days')->format('Y-m-d');

    $picked = array_rand(array_flip(range(0, count(TEST_INTEREST_TAGS) - 1)), 3);   // 키 3개 (오름차순)
    sort($picked);
    $interests = implode(',', array_map(fn($i) => TEST_INTEREST_TAGS[$i], $picked));

    return [
        'name'       => $name,
        'job'        => TEST_JOBS[random_int(0, count(TEST_JOBS) - 1)],
        'birth_date' => $birth,
        'mbti'       => TEST_MBTI[random_int(0, count(TEST_MBTI) - 1)],
        'interests'  => $interests,
    ];
}

/** 관리자 활동 로그 — 비밀번호는 기록하지 않는다 */
function _testUsersLog(string $act, string $summary, $after = null): void {
    logAdminActivity($act, 'user', 'test-users', $summary, null, $after);
}

/** 활성 테스트 회원 행 (이메일 소문자 키) */
function _activeTestUsers(PDO $pdo, array $emails): array {
    $out = [];
    $stmt = $pdo->prepare("SELECT id, email, name, gender, role FROM users WHERE LOWER(email) = ? AND status = 'active' LIMIT 1");
    foreach ($emails as $e) {
        $stmt->execute([$e]);
        $u = $stmt->fetch();
        if ($u && isTestUser((string)$u['email']) && ($u['role'] ?? 'user') !== 'admin') $out[$e] = $u;
    }
    return $out;
}

function _bookingsFile(string $email): string {
    return dataDir() . '/bookings_' . md5(strtolower(trim($email))) . '.json';
}

/** 취소되지 않은 예약 (기존 [취소] 대상과 같은 기준: status !== 'cancelled') */
function _activeBookings(string $email): array {
    $f = _bookingsFile($email);
    $list = file_exists($f) ? json_decode((string)file_get_contents($f), true) : [];
    if (!is_array($list)) return [];
    return array_values(array_filter($list, fn($b) => is_array($b) && (string)($b['status'] ?? '') !== 'cancelled'));
}

// ─── create ───────────────────────────────────────────────────────
if ($action === 'create') {
    $password = (string)($body['password'] ?? '');
    if (strlen($password) < 8) jsonFail('비밀번호는 8자 이상이어야 합니다.');
    $targets = _testUsersTargets($body, false);

    $created = [];
    $existing = 0;
    $logCreate = function () use (&$created, &$existing) {
        if ($created) _testUsersLog('create', '테스트 회원 만들기 — 새로 만듦 ' . count($created) . '개 / 이미 있음 ' . $existing . '개', ['created' => $created]);
    };

    try {
        $pdo  = getDB();
        $hash = password_hash($password, PASSWORD_BCRYPT);

        $findEmail = $pdo->prepare("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1");
        $findPhone = $pdo->prepare("SELECT id FROM users WHERE REPLACE(REPLACE(phone,'-',''),' ','') = ? LIMIT 1");
        $insert    = $pdo->prepare("
            INSERT INTO users (email, password_hash, name, phone, gender, birth_date, marital_status,
                               job, mbti, interests, ideal_type, location, status, role)
            VALUES (?, ?, ?, ?, ?, ?, '싱글', ?, ?, ?, '테스트 이상형', '서울특별시 강남구', 'active', 'user')
        ");
        $usedNames = [];

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

            $p = randomTestProfile($male, $usedNames);
            try {
                $insert->execute([
                    $email, $hash, $p['name'], formatPhone($phone), $male ? '남성' : '여성',
                    $p['birth_date'], $p['job'], $p['mbti'], $p['interests'],
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
        error_log('[admin/test-users create] ' . $e->getMessage());
        $logCreate();
        jsonFail('처리 중 오류가 발생했습니다.' . ($created ? ' (먼저 만든 ' . count($created) . '개는 저장됨)' : ''), 500);
    }

    $logCreate();
    jsonOut(['ok' => true, 'created' => count($created), 'existing' => $existing, 'createdEmails' => $created]);
}

// ─── shuffle ──────────────────────────────────────────────────────
if ($action === 'shuffle') {
    $updated = [];
    try {
        $pdo   = getDB();
        $users = _activeTestUsers($pdo, testUserEmails());
        $upd   = $pdo->prepare("UPDATE users SET name = ?, job = ?, birth_date = ?, mbti = ?, interests = ? WHERE id = ?");
        $usedNames = [];
        foreach ($users as $email => $u) {
            $g    = (string)($u['gender'] ?? '');
            $male = $g === '남성' || ($g !== '여성' && str_starts_with($email, 'a'));
            $p    = randomTestProfile($male, $usedNames);
            $upd->execute([$p['name'], $p['job'], $p['birth_date'], $p['mbti'], $p['interests'], (int)$u['id']]);
            $updated[] = $email;
        }
    } catch (Throwable $e) {
        error_log('[admin/test-users shuffle] ' . $e->getMessage());
        jsonFail('처리 중 오류가 발생했습니다.', 500);
    }
    if ($updated) _testUsersLog('update', '테스트 회원 프로필 다시 섞기 — ' . count($updated) . '명', ['updated' => $updated]);
    jsonOut(['ok' => true, 'updated' => count($updated)]);
}

// ─── check ────────────────────────────────────────────────────────
if ($action === 'check') {
    $targets = _testUsersTargets($body, true);
    try {
        $users = _activeTestUsers(getDB(), $targets);
    } catch (Throwable $e) {
        error_log('[admin/test-users check] ' . $e->getMessage());
        jsonFail('처리 중 오류가 발생했습니다.', 500);
    }
    $members = []; $total = 0;
    foreach ($users as $email => $u) {
        $n = count(_activeBookings($email));
        $total += $n;
        $members[] = ['email' => $email, 'name' => (string)$u['name'], 'activeBookings' => $n];
    }
    jsonOut(['ok' => true, 'members' => $members, 'activeBookings' => $total]);
}

// ─── delete ───────────────────────────────────────────────────────
$targets = _testUsersTargets($body, true);
$deleted = [];
$cancelledBookings = 0;
try {
    $pdo   = getDB();
    $users = _activeTestUsers($pdo, $targets);
    $dir   = dataDir();

    $anonymizeSql = "
        UPDATE users
           SET status='withdrawn', withdrawn_at=NOW(),
               name='탈퇴회원', nickname=NULL, phone=?,
               sns_user_id=NULL, sns_access_token=NULL,
               email=?
         WHERE id=?
    ";

    foreach ($users as $email => $u) {
        // 1) 회원 삭제 — 기존 회원 삭제(api/admin/users.php)와 같은 익명화. 먼저 해 두어, 실패하면 아무것도 바뀌지 않는다.
        //    연락처는 기존과 같이 NULL 로 지우고, DB 가 NULL 을 받지 않으면(phone NOT NULL, db/migrations/001)
        //    겹치지 않는 자리표시 값으로 지운다.
        $userId    = (int)$u['id'];
        $anonEmail = 'deleted_' . $userId . '_' . bin2hex(random_bytes(4)) . '@withdrawn.local';
        try {
            $pdo->prepare($anonymizeSql)->execute([null, $anonEmail, $userId]);
        } catch (PDOException $e) {
            $pdo->prepare($anonymizeSql)->execute(['withdrawn-' . $userId, $anonEmail, $userId]);
        }

        // 2) 취소되지 않은 예약 → 기존 [취소] 규칙으로 인원·쿠폰 정리
        $active = _activeBookings($email);
        if ($active) {
            $fp = fopen("$dir/party_counts.json", 'c+');
            if ($fp) {
                flock($fp, LOCK_EX);
                $raw = stream_get_contents($fp);
                $counts = $raw ? json_decode($raw, true) : [];
                if (!is_array($counts)) $counts = [];
                foreach ($active as $b) {
                    $partyId   = (string)($b['partyId'] ?? '');
                    $genderKey = (string)($b['gender'] ?? '') === '남성' ? 'male' : 'female';
                    // 무통장 미입금 건은 인원에 더해진 적이 없으므로 차감하지 않는다 (bookings.php cancel 과 같음)
                    $wasCounted = !(($b['paymentMethod'] ?? '') === 'vbank' && empty($b['vbankPaidAt']));
                    if ($partyId !== '' && $wasCounted) {
                        countsAdjust($counts, $partyId, $genderKey, array_map('strval', (array)($b['sessionIds'] ?? [])), -1);
                    }
                }
                ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($counts));
                fflush($fp); flock($fp, LOCK_UN); fclose($fp);
            }
            foreach ($active as $b) {
                releaseCouponUsage((string)($b['couponCode'] ?? ''), $email);
                @file_put_contents("$dir/_admin_cancellations.log", sprintf(
                    "[%s] CANCELLED(test-user delete) email=%s bid=%s partyId=%s gender=%s\n",
                    date('c'), $email, (string)($b['id'] ?? ''), (string)($b['partyId'] ?? ''), (string)($b['gender'] ?? '')
                ), FILE_APPEND);
                $cancelledBookings++;
            }
        }

        // 3) 예약·장바구니·프로필 파일 정리
        $hash = md5($email);
        @unlink("$dir/bookings_$hash.json");
        @unlink("$dir/cart_$hash.json");
        @unlink("$dir/profile_$hash.json");

        @file_put_contents("$dir/_admin_user_deletions.log", sprintf(
            "[%s] adminId=%s userId=%d originalEmail=%s (test-user, bookings=%d)\n",
            date('c'), $_SESSION['adminId'] ?? '?', $userId, $email, count($active)
        ), FILE_APPEND);
        $deleted[] = $email;
    }
} catch (Throwable $e) {
    error_log('[admin/test-users delete] ' . $e->getMessage());
    if ($deleted) _testUsersLog('delete', '테스트 회원 삭제 — ' . count($deleted) . '명 (오류로 중단)', ['deleted' => $deleted]);
    jsonFail('처리 중 오류가 발생했습니다.' . ($deleted ? ' (먼저 삭제한 ' . count($deleted) . '명은 처리됨)' : ''), 500);
}

if ($deleted) {
    _testUsersLog('delete', '테스트 회원 삭제 — ' . count($deleted) . '명, 예약 ' . $cancelledBookings . '건 정리', ['deleted' => $deleted]);
}
jsonOut(['ok' => true, 'deleted' => count($deleted), 'deletedEmails' => $deleted, 'cancelledBookings' => $cancelledBookings]);
