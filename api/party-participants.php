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
 *  - status ∈ ['confirmed', 'pending_approval'] 만 노출
 *    (paid_pending_profile = 프로필 미완성, cancelled = 취소 → 둘 다 제외)
 *  - paymentId 가 'test-' 로 시작하면 제외 (테스트 데이터 필터)
 *  - 이름은 maskName() 으로 마스킹, 생년월일은 ageBand() 으로 변환
 *  - 직업·MBTI 는 그대로 노출 (관리자 폼에서 입력한 공개 의도)
 *
 * 구현 방식:
 *  1) DB 에서 활성 회원 전체를 한 번에 SELECT (id, email, name, gender, mbti, job, birth_date)
 *  2) 회원별 bookings_<md5(email)>.json 을 순회하며 partyId 일치 + 노출 가능한 booking 만 추림
 *  3) gender 별로 male/female 배열 분리
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
$VISIBLE_STATUSES = ['confirmed', 'pending_approval'];

$male = [];
$female = [];

try {
    $pdo = getDB();
    $stmt = $pdo->query("
        SELECT id, email, name, gender, mbti, job,
               DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date
        FROM users
        WHERE status = 'active'
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

        $entry = [
            'id'         => (string)($b['id'] ?? bin2hex(random_bytes(4))),
            'maskedName' => maskName((string)$u['name']),
            'ageBand'    => $u['birth_date'] ? ageBand((string)$u['birth_date']) : '',
            'mbti'       => (string)($u['mbti'] ?? ''),
            'job'        => (string)($u['job']  ?? ''),
        ];

        if ($u['gender'] === '남성')      $male[]   = $entry;
        else if ($u['gender'] === '여성') $female[] = $entry;
        // 다른 booking 이 같은 user/party 에 또 있을 가능성은 낮지만,
        // 중복 진입은 막기 위해 첫 매칭에서 break
        break;
    }
}

echo json_encode([
    'ok'     => true,
    'male'   => $male,
    'female' => $female,
], JSON_UNESCAPED_UNICODE);
