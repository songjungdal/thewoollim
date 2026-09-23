<?php
/**
 * 특정 파티의 참가 확정자 명단 (공개, 익명화).
 *
 * GET ?partyId=<id> → {
 *   ok: true,
 *   male:   [{id, maskedName, ageBand, mbti, job}, ...],
 *   female: [...]
 * }
 *
 * 노출 규칙:
 *  - status ∈ ['confirmed', 'pending_approval', 'paid_pending_profile'] 만 노출
 *    (cancelled = 취소 → 제외. paid_pending_profile 은 mbti/job 이 비어있는 채로 노출되며,
 *     프로필 작성 완료로 pending_approval 전환 시 프론트 30초 폴링으로 자동 반영됨)
 *  - paymentId 가 'test-' 로 시작하면 제외 (테스트 데이터 필터)
 *  - 이름은 maskName() 으로 마스킹, 생년월일은 ageBand() 으로 변환
 *  - 직업·MBTI 는 그대로 노출 (관리자 폼에서 입력한 공개 의도)
 *  - 탈퇴 회원: 진행 예정/진행 중 파티(행사일 미경과)는 기존과 동일하게 제외.
 *    단, 행사일이 이미 지난(완료된) 파티는 탈퇴 회원도 명단에 포함 — 탈퇴 시 익명화되는
 *    항목은 name/phone/nickname/SNS 뿐이고 gender/mbti/job/birth_date 는 유지되므로
 *    (delete-account.php 참고) 노출 항목(성별·나이대·MBTI·직업) 자체엔 영향 없음.
 *
 * 구현 방식:
 *  1) 파티의 calendarDate 로 "이미 지난 파티"인지 판별
 *  2) DB 에서 회원을 SELECT — 지난 파티면 활성+탈퇴 모두, 아니면 기존처럼 활성 회원만
 *  3) 회원별 bookings_<md5(email)>.json 을 순회하며 partyId 일치 + 노출 가능한 booking 만 추림
 *     (탈퇴 회원은 파일이 익명화 이메일 해시로 rename 되어 있어 동일 로직으로 자동 조회됨)
 *  4) gender 별로 male/female 배열 분리
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/db.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonFail('method not allowed', 405);
}

$partyId = trim((string)($_GET['partyId'] ?? ''));
if ($partyId === '') {
    jsonOut(['ok' => true, 'male' => [], 'female' => []]);
}

$dir = dataDir();
$VISIBLE_STATUSES = ['confirmed', 'pending_approval', 'completed', 'paid_pending_profile'];

// 이미 지난(행사일 경과) 파티인지 확인 — 지난 파티에 한해서만 탈퇴 회원 노출 예외 허용.
// 파티 정보를 못 찾으면(삭제됨 등) 안전하게 false 로 두어 기존 동작(탈퇴 회원 제외) 유지.
$partyIsPast = false;
$partiesJson = json_decode((string)@file_get_contents($dir . '/parties.json'), true);
if (is_array($partiesJson)) {
    foreach ($partiesJson as $p) {
        if ((string)($p['id'] ?? '') === $partyId) {
            $cal = (string)($p['calendarDate'] ?? '');
            if ($cal !== '' && $cal < date('Y-m-d')) $partyIsPast = true;
            break;
        }
    }
}

$male = [];
$female = [];

try {
    $pdo = getDB();
    $statusSql = $partyIsPast ? "status IN ('active', 'withdrawn')" : "status = 'active'";
    $stmt = $pdo->query("
        SELECT id, email, name, gender, mbti, job, status,
               DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date
        FROM users
        WHERE $statusSql
    ");
    $users = $stmt->fetchAll();
} catch (Throwable $e) {
    error_log('[party-participants] DB error: ' . $e->getMessage());
    jsonOut(['ok' => true, 'male' => [], 'female' => []]);
}

foreach ($users as $u) {
    $email = (string)$u['email'];
    $hash  = md5(normalizeEmail($email));
    $bf    = $dir . '/bookings_' . $hash . '.json';
    if (!file_exists($bf)) continue;

    $raw = file_get_contents($bf);
    $bookings = json_decode((string)$raw, true);
    if (!is_array($bookings)) continue;

    foreach ($bookings as $b) {
        if (!is_array($b)) continue;
        if ((string)($b['partyId'] ?? '') !== $partyId) continue;
        if (!in_array((string)($b['status'] ?? ''), $VISIBLE_STATUSES, true)) continue;

        $pid = strtolower((string)($b['paymentId'] ?? ''));
        if (str_starts_with($pid, 'test-')) continue;

        // 프로필 완성도 체크 — 필수 필드(name, gender) 없는 회원 제외
        if (trim((string)$u['name']) === '' || trim((string)$u['gender']) === '') continue;

        // 탈퇴 회원은 "탈퇴회원" 익명화 이름을 그대로 마스킹하면 "탈***"처럼 탈퇴 사실이 드러나므로,
        // 이 명단에서만 성 없이 "***"로 노출 (다른 화면의 maskName() 사용처는 그대로 둠)
        $isWithdrawnUser = (string)($u['status'] ?? '') === 'withdrawn';

        $entry = [
            'id'         => (string)($b['id'] ?? bin2hex(random_bytes(4))),
            'maskedName' => $isWithdrawnUser ? '***' : maskName((string)$u['name']),
            'ageBand'    => $u['birth_date'] ? ageBand((string)$u['birth_date']) : '',
            'mbti'       => (string)($u['mbti'] ?? ''),
            'job'        => (string)($u['job']  ?? ''),
            'status'     => (string)($b['status'] ?? ''),  // 'confirmed' | 'pending_approval'
            'createdAt'  => (string)($b['createdAt'] ?? ''), // 정렬 전용 — 응답 직전에 제거
        ];

        if ($u['gender'] === '남성')      $male[]   = $entry;
        else if ($u['gender'] === '여성') $female[] = $entry;
        // 다른 booking 이 같은 user/party 에 또 있을 가능성은 낮지만,
        // 중복 진입은 막기 위해 첫 매칭에서 break
        break;
    }
}

// 참가신청 순서(먼저 신청한 사람이 위, 최근 신청한 사람이 아래)로 정렬 — createdAt 오름차순
usort($male,   fn($a, $b) => strcmp((string)$a['createdAt'], (string)$b['createdAt']));
usort($female, fn($a, $b) => strcmp((string)$a['createdAt'], (string)$b['createdAt']));

// 정렬 전용 필드 — 응답 스키마는 기존과 동일하게 유지
foreach ($male as &$e)   unset($e['createdAt']);
foreach ($female as &$e) unset($e['createdAt']);
unset($e);

echo json_encode([
    'ok'     => true,
    'male'   => $male,
    'female' => $female,
], JSON_UNESCAPED_UNICODE);
