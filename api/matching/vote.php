<?php
/**
 * 매칭 투표 제출 (또는 갱신).
 *
 * POST { partyId, voter_number, picks: [n1, n2] } → { ok: true }
 *
 * 검증:
 *  - 회원 로그인 + 본인이 해당 파티 'confirmed' 상태
 *  - 파티의 voting_status === 'open'
 *  - voter_number: 1~99 정수
 *  - picks: 길이 1~3, 1~99 정수, voter_number 와 다름, 중복 없음
 *  - INSERT ... ON DUPLICATE KEY UPDATE → 동일 (party_id, user_id) 재투표 시 갱신
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();
requireUser();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body         = jsonBody();
$partyId      = trim((string)($body['partyId']     ?? ''));
$voterNumber  = (int)            ($body['voter_number'] ?? 0);
$picks        = $body['picks'] ?? null;

if ($partyId === '')                                jsonFail('파티 ID 가 필요합니다.');
if ($voterNumber < 1 || $voterNumber > 99)          jsonFail('본인 번호를 1~99 사이로 입력해주세요.');
if (!is_array($picks))                              jsonFail('투표 대상이 누락되었습니다.');

// picks 정규화
$picksClean = [];
foreach ($picks as $p) {
    $n = (int)$p;
    if ($n < 1 || $n > 99)            jsonFail('투표 번호는 1~99 사이여야 합니다.');
    if ($n === $voterNumber)          jsonFail('본인 번호는 선택할 수 없습니다.');
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
