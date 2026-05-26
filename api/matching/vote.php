<?php
/**
 * 매칭 투표 제출 (또는 갱신).
 *
 * POST { partyId, voter_number, voter_gender?, voter_id?, picks: [n1, n2] } → { ok: true }
 *   - voter_gender : 클라이언트가 보조 식별을 위해 보내는 성별 ("남성"/"여성"). 서버 측 booking/profile 과 대조해 일치 시에만 허용.
 *   - voter_id     : "M-3" / "F-3" 형식의 디버깅 보조 식별자. DB 저장하지 않고 검증만 수행.
 *
 * 검증:
 *  - 회원 로그인 + 본인이 해당 파티 'confirmed' 상태
 *  - 파티의 voting_status === 'open'
 *  - voter_number: 1~99 정수
 *  - voter_gender(클라): 서버에서 추출한 성별과 일치해야 함 (불일치 시 차단)
 *  - picks: 길이 1~3, 1~99 정수, voter_number 와 다름, 중복 없음
 *  - INSERT ... ON DUPLICATE KEY UPDATE → 동일 (party_id, user_id) 재투표 시 갱신
 *
 * 성별 분리 정책 (v4.1):
 *   '남자 1번' 과 '여자 1번' 은 voter_number=1 이 동일해도 voter_gender 컬럼이 달라 DB 상 서로 다른
 *   레코드로 저장됨. results.php 의 매칭 검색은 voter_gender 가 본인과 다른 레코드만 후보에 두므로
 *   동일 번호 동일 성별 충돌(자기 자신 매칭) 은 발생하지 않음.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();
requireUser();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body            = jsonBody();
$partyId         = trim((string)($body['partyId']      ?? ''));
$voterNumber     = (int)        ($body['voter_number'] ?? 0);
$picks           = $body['picks'] ?? null;
// 클라이언트가 보조로 보내는 성별/식별자 — 서버 측 DB 값과 대조 검증만 수행 (단독 신뢰 X)
$clientGender    = trim((string)($body['voter_gender']  ?? ''));
$clientVoterId   = trim((string)($body['voter_id']      ?? ''));
// picks_detailed — 각 선택 대상에 반대 성별 식별자 포함 (선택). 검증만 수행, DB 저장 X
$clientPicksDtl  = is_array($body['picks_detailed'] ?? null) ? $body['picks_detailed'] : null;

if ($partyId === '')                                jsonFail('파티 ID 가 필요합니다.');
if ($voterNumber < 1 || $voterNumber > 99)          jsonFail('본인 번호를 1~99 사이로 입력해주세요.');
if (!is_array($picks))                              jsonFail('투표 대상이 누락되었습니다.');

// picks 정규화
// v4.1 성별 분리: voter 는 본인 성별(M-N), picks 는 반대 성별(F-N) namespace.
// 동일 숫자라도 성별이 달라 별개 참가자 → 자기 번호 차단 검사 제거.
// (results.php 매칭 알고리즘이 voter_gender 1차 필터로 동성 매칭을 차단하므로 안전)
$picksClean = [];
foreach ($picks as $p) {
    $n = (int)$p;
    if ($n < 1 || $n > 99)            jsonFail('투표 번호는 1~99 사이여야 합니다.');
    if (in_array($n, $picksClean, true)) jsonFail('중복된 번호는 선택할 수 없습니다.');
    $picksClean[] = $n;
}
if (count($picksClean) < 1 || count($picksClean) > 3) {
    jsonFail('투표 대상은 1~3명이어야 합니다.');
}

$email  = currentUserEmail();
$userId = currentUserId();

// 파티 voting_status 검증
$dir = dataDir();
$parties = json_decode((string)@file_get_contents($dir . '/parties.json'), true);
$found = null;
foreach ((array)$parties as $p) {
    if ((string)($p['id'] ?? '') === $partyId) { $found = $p; break; }
}
if (!$found) jsonFail('파티를 찾을 수 없습니다.', 404);
if (($found['voting_status'] ?? 'closed') !== 'open') {
    jsonFail('현재 투표가 열려있지 않습니다.', 403);
}

// 본인 confirmed 검증
$bookings = json_decode((string)@file_get_contents($dir . '/bookings_' . md5($email) . '.json'), true);
$isConfirmed = false;
$gender = '';
if (is_array($bookings)) {
    foreach ($bookings as $b) {
        if ((string)($b['partyId'] ?? '') === $partyId && ($b['status'] ?? '') === 'confirmed') {
            $isConfirmed = true;
            $gender = (string)($b['gender'] ?? '');
            break;
        }
    }
}
if (!$isConfirmed) jsonFail('해당 파티의 참가확정 회원만 투표 가능합니다.', 403);
if ($gender === '') {
    // 본인 프로필 gender 로 fallback
    try {
        $pdo  = getDB();
        $stmt = $pdo->prepare("SELECT gender FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$userId]);
        $u = $stmt->fetch();
        $gender = (string)($u['gender'] ?? '');
    } catch (Throwable $e) {}
}

// === 성별 분리 검증 (v4.1) ===
// 서버 측 DB-derived $gender 가 source of truth. 클라이언트가 voter_gender 를 보낸 경우 일치 여부 점검.
// 동일 번호(1번)라도 voter_gender 컬럼이 달라 DB 상 서로 다른 레코드로 저장됨.
if ($gender === '')                                         jsonFail('회원 성별 정보가 없어 투표할 수 없습니다.', 403);
if ($clientGender !== '' && $clientGender !== $gender)      jsonFail('성별 식별 정보가 일치하지 않습니다. 다시 로그인해주세요.', 403);
// voter_id 형식 검증 (보조) — 'M-3' / 'F-3' 패턴. 클라이언트가 보낸 경우에만 검사.
if ($clientVoterId !== '') {
    $expectPrefix = $gender === '남성' ? 'M' : ($gender === '여성' ? 'F' : '?');
    $expectVoterId = $expectPrefix . '-' . $voterNumber;
    if ($clientVoterId !== $expectVoterId) {
        jsonFail('식별자(voter_id)가 성별·번호와 일치하지 않습니다.', 400);
    }
}

// picks_detailed 검증 (보조) — 클라이언트가 보낸 경우에만, 각 항목이 반대 성별로 매핑돼있는지 점검.
// 동일 숫자 동성 매칭 차단 — 매칭 알고리즘은 results.php 의 voter_gender 필터로 이미 보장되지만,
// 클라이언트 단에서도 동일 인식이 유지되는지 한 번 더 대조 (다중 디바이스/구버전 앱 fallback 방어).
if ($clientPicksDtl !== null) {
    $expectOppGender = $gender === '남성' ? '여성' : ($gender === '여성' ? '남성' : '');
    $expectOppPrefix = $gender === '남성' ? 'F'    : ($gender === '여성' ? 'M'    : '?');
    if (count($clientPicksDtl) !== count($picksClean)) {
        jsonFail('picks 와 picks_detailed 길이가 일치하지 않습니다.', 400);
    }
    foreach ($clientPicksDtl as $i => $row) {
        $tn = (int)        ($row['target_number'] ?? 0);
        $tg = trim((string)($row['target_gender'] ?? ''));
        $tid = trim((string)($row['target_id']    ?? ''));
        if ($tn !== (int)$picksClean[$i])                   jsonFail('picks_detailed 의 번호가 picks 와 다릅니다.', 400);
        if ($expectOppGender !== '' && $tg !== $expectOppGender) {
            jsonFail('picks_detailed 대상 성별이 본인과 같은 성별로 잘못 지정되었습니다.', 400);
        }
        if ($tid !== '' && $tid !== ($expectOppPrefix . '-' . $tn)) {
            jsonFail('picks_detailed 의 식별자(target_id) 형식이 일치하지 않습니다.', 400);
        }
    }
}

try {
    $pdo  = getDB();
    $stmt = $pdo->prepare("
        INSERT INTO match_votes (party_id, voter_user_id, voter_email, voter_gender, voter_number, picks)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE voter_number = VALUES(voter_number), picks = VALUES(picks),
                                 voter_email  = VALUES(voter_email),  voter_gender = VALUES(voter_gender)
    ");
    $stmt->execute([$partyId, $userId, $email, $gender, $voterNumber, json_encode($picksClean)]);
} catch (Throwable $e) {
    error_log('[matching/vote] ' . $e->getMessage());
    jsonFail('투표 저장 중 오류가 발생했습니다.', 500);
}

jsonOut(['ok' => true]);
