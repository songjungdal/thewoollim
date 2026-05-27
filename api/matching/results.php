<?php
/**
 * 매칭 결과 조회 — 'finalized' 상태에서만 노출.
 *
 * GET ?partyId=<id> → {
 *   ok: true,
 *   voting_status: 'closed'|'open'|'finalized',
 *   matched: bool,
 *   matches?: [
 *     { name, gender, birth_date, phone }   ← 매칭 성공한 상대만 (실패 시 절대 미노출)
 *   ]
 * }
 *
 * 매칭 알고리즘 — 번호 기반 reciprocity:
 *  본인 voter A (number=N_A, picks=[p1, p2])
 *  대상 voter B (number=N_B, picks=[q1, q2])
 *  → A 가 N_B 를 picks 했고 (N_B ∈ A.picks)
 *    B 가 N_A 를 picks 했으면 (N_A ∈ B.picks) → 상호 매칭
 *  → 이성(gender !=)만 매칭
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();
requireUser();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);

$partyId = trim((string)($_GET['partyId'] ?? ''));
if ($partyId === '') jsonFail('파티 ID 가 필요합니다.');

$dir = dataDir();
$parties = json_decode((string)@file_get_contents($dir . '/parties.json'), true);
$found = null;
foreach ((array)$parties as $p) {
    if ((string)($p['id'] ?? '') === $partyId) { $found = $p; break; }
}
if (!$found) jsonFail('파티를 찾을 수 없습니다.', 404);

$status = (string)($found['voting_status'] ?? 'closed');

// 진행 중인 'open' 상태는 결과 미노출 (투표 입력 폼이 표시되어야 함).
// 'finalized' 와 'closed' 는 통과 — 'closed' 라도 본인 vote 가 보존되어 있다면 매칭 결과를 다시 조회 가능.
// (pre-v6.8 reset 은 match_votes 를 삭제하지 않고 voting_status 만 closed 로 되돌렸기 때문)
if ($status === 'open') {
    jsonOut(['ok' => true, 'voting_status' => $status, 'matched' => false]);
}

$userId  = currentUserId();
$matches = [];

// DB fetch + 매칭 검색을 동일 try 블록 안에 두어 변수 scope 모호성 제거.
// jsonOut/jsonFail 은 내부에서 exit → 호출 후 코드 도달 불가.
try {
    $pdo  = getDB();
    // 본인 vote
    $stmt = $pdo->prepare("SELECT voter_number, voter_gender, picks FROM match_votes WHERE party_id = ? AND voter_user_id = ? LIMIT 1");
    $stmt->execute([$partyId, $userId]);
    $myVote = $stmt->fetch();
    if (!$myVote) {
        // 본인 vote 기록 없음 → 매칭 결과 불가 (finalized / closed 어느 쪽이든 동일)
        jsonOut(['ok' => true, 'voting_status' => $status, 'matched' => false]);
    }
    // 여기 도달 = 본인 vote 보유 → 매칭 결과 노출 허용 (closed+vote잔존 케이스 포함)

    $myNumber = (int)$myVote['voter_number'];
    $myGender = (string)$myVote['voter_gender'];
    $myPicks  = json_decode((string)$myVote['picks'], true) ?: [];

    // 같은 파티의 모든 vote
    $stmt = $pdo->prepare("
        SELECT v.voter_user_id, v.voter_number, v.voter_gender, v.picks,
               u.name, u.phone,
               DATE_FORMAT(u.birth_date, '%Y-%m-%d') AS birth_date
        FROM match_votes v
        JOIN users u ON u.id = v.voter_user_id
        WHERE v.party_id = ?
    ");
    $stmt->execute([$partyId]);
    $allVotes = $stmt->fetchAll();

    // 상호 매칭 검색 — 이성 + 양방향 picks 일치
    // 성별 분리 (v4.1): voter_gender 컬럼으로 본인과 동일 성별 레코드를 먼저 제외 → '남자 1번' 이 본인 picks 의 '1'
    // 을 처리할 때 자동으로 '여자 1번' 만 매칭 후보로 남는다. 동일 숫자 충돌 X.
    foreach ($allVotes as $v) {
        if ((int)$v['voter_user_id'] === (int)$userId) continue;
        if ($v['voter_gender'] === $myGender) continue; // 이성만 (성별 분리 1차 필터)
        $vNumber = (int)$v['voter_number'];
        $vPicks  = json_decode((string)$v['picks'], true) ?: [];

        $iPickedThem  = in_array($vNumber, $myPicks, true);
        $theyPickedMe = in_array($myNumber, $vPicks, true);

        if ($iPickedThem && $theyPickedMe) {
            $matches[] = [
                'name'         => (string)$v['name'],
                'gender'       => (string)$v['voter_gender'],
                'voter_number' => $vNumber,                              // v4.5: 결과 페이지 헤드라인 동적 노출용 ("여성 3번과 매칭")
                'birth_date'   => (string)$v['birth_date'],
                'phone'        => formatPhone((string)$v['phone']),
            ];
        }
    }
} catch (Throwable $e) {
    error_log('[matching/results] ' . $e->getMessage());
    jsonFail('서버 오류', 500);
}

jsonOut([
    'ok'            => true,
    'voting_status' => $status,    // 실제 파티 상태 그대로 반환 (finalized 또는 closed+vote잔존)
    'matched'       => !empty($matches),
    'matches'       => $matches,
]);
