<?php
/**
 * 매칭 투표 상태 + 회원 본인의 confirmed 파티 목록 조회.
 *
 * GET → {
 *   ok: true,
 *   user: { name, gender, birth_date, phone, email },
 *   parties: [
 *     { id, title, dateString, voting_status: 'closed'|'open'|'finalized',
 *       my_vote?: { voter_number, picks } }
 *   ]
 * }
 *
 * 노출 조건: 회원 로그인 + 본인이 'confirmed' 상태로 가입한 파티만
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();
requireUser();

$email = currentUserEmail();
$userId = currentUserId();

// 회원 정보
try {
    $pdo  = getDB();
    $stmt = $pdo->prepare("
        SELECT name, gender, phone,
               DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date
        FROM users WHERE id = ? AND status='active' LIMIT 1
    ");
    $stmt->execute([$userId]);
    $u = $stmt->fetch();
    if (!$u) jsonFail('회원 정보를 찾을 수 없습니다.', 404);
} catch (Throwable $e) {
    error_log('[matching/state user] ' . $e->getMessage());
    jsonFail('서버 오류', 500);
}

// 본인 booking 중 confirmed 만 추출
$dir          = dataDir();
$bookingsFile = $dir . '/bookings_' . md5($email) . '.json';
$myConfirmedPartyIds = [];
if (file_exists($bookingsFile)) {
    $b = json_decode((string)file_get_contents($bookingsFile), true);
    if (is_array($b)) {
        foreach ($b as $row) {
            if (($row['status'] ?? '') === 'confirmed') {
                $myConfirmedPartyIds[(string)$row['partyId']] = true;
            }
        }
    }
}

// parties.json 매핑
$parties = [];
if (file_exists($dir . '/parties.json')) {
    $allParties = json_decode((string)file_get_contents($dir . '/parties.json'), true);
    if (is_array($allParties)) {
        foreach ($allParties as $p) {
            $pid = (string)($p['id'] ?? '');
            if ($pid === '' || !isset($myConfirmedPartyIds[$pid])) continue;
            $parties[] = [
                'id'             => $pid,
                'title'          => (string)($p['title']       ?? ''),
                'dateString'     => (string)($p['dateString']  ?? ''),
                'voting_status'  => (string)($p['voting_status'] ?? 'closed'),
            ];
        }
    }
}

// 본인 투표 기록 (있으면 합성)
if (!empty($parties)) {
    $partyIdList = array_column($parties, 'id');
    $placeholders = implode(',', array_fill(0, count($partyIdList), '?'));
    $stmt = $pdo->prepare("SELECT party_id, voter_number, picks FROM match_votes WHERE voter_user_id = ? AND party_id IN ($placeholders)");
    $stmt->execute(array_merge([$userId], $partyIdList));
    $myVotes = [];
    foreach ($stmt->fetchAll() as $v) {
        $myVotes[(string)$v['party_id']] = [
            'voter_number' => (int)$v['voter_number'],
            'picks'        => json_decode((string)$v['picks'], true) ?: [],
        ];
    }
    foreach ($parties as &$p) {
        if (isset($myVotes[$p['id']])) $p['my_vote'] = $myVotes[$p['id']];
    }
    unset($p);
}

jsonOut([
    'ok'      => true,
    'user'    => [
        'email'      => $email,
        'name'       => (string)($u['name']       ?? ''),
        'gender'     => (string)($u['gender']     ?? ''),
        'phone'      => formatPhone((string)($u['phone'] ?? '')),
        'birth_date' => (string)($u['birth_date'] ?? ''),
    ],
    'parties' => $parties,
]);
