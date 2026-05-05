<?php
/**
 * 관리자 매칭 투표 제어 + 결과 조회.
 *
 * GET ?partyId=<id> → {
 *   ok: true,
 *   voting_status,
 *   votes: [{ voter_number, gender, name, email, picks: [...] }, ...],
 *   matches: [{ a: {number, name, gender}, b: {number, name, gender} }, ...]   ← 상호 매칭 쌍
 * }
 *
 * POST { action: 'start'|'end'|'reset', partyId } → { ok: true }
 *  - start  → voting_status = 'open'
 *  - end    → voting_status = 'finalized'  (결과 노출 시작)
 *  - reset  → voting_status = 'closed'    (전체 재설정 — vote 삭제하지 않음)
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

$file = dataDir() . '/parties.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $partyId = trim((string)($_GET['partyId'] ?? ''));
    if ($partyId === '') jsonFail('partyId 가 필요합니다.');

    $parties = json_decode((string)@file_get_contents($file), true);
    $found = null;
    foreach ((array)$parties as $p) {
        if ((string)($p['id'] ?? '') === $partyId) { $found = $p; break; }
    }
    if (!$found) jsonFail('파티를 찾을 수 없습니다.', 404);

    try {
        $pdo  = getDB();
        $stmt = $pdo->prepare("
            SELECT v.voter_number, v.voter_gender, v.voter_email, v.picks,
                   u.name, DATE_FORMAT(v.updated_at, '%Y-%m-%d %H:%i') AS updated_at
            FROM match_votes v
            LEFT JOIN users u ON u.id = v.voter_user_id
            WHERE v.party_id = ?
            ORDER BY v.voter_gender, v.voter_number
        ");
        $stmt->execute([$partyId]);
        $rawVotes = $stmt->fetchAll();
    } catch (Throwable $e) {
        error_log('[admin/matching GET] ' . $e->getMessage());
        jsonFail('서버 오류', 500);
    }

    $votes = [];
    foreach ($rawVotes as $v) {
        $votes[] = [
            'voter_number' => (int)$v['voter_number'],
            'gender'       => (string)$v['voter_gender'],
            'name'         => (string)($v['name'] ?? ''),
            'email'        => (string)$v['voter_email'],
            'picks'        => json_decode((string)$v['picks'], true) ?: [],
            'updated_at'   => (string)$v['updated_at'],
        ];
    }

    // 상호 매칭 쌍 검색
    $matches = [];
    $seen = [];
    foreach ($votes as $a) {
        foreach ($votes as $b) {
            if ($a['gender'] === $b['gender']) continue;
            if (!in_array($b['voter_number'], $a['picks'], true)) continue;
            if (!in_array($a['voter_number'], $b['picks'], true)) continue;
            $key = min($a['voter_number'], $b['voter_number']) . '-' .
                   max($a['voter_number'], $b['voter_number']) . '-' .
                   ($a['gender'] === '남성' ? 'M' : 'F');
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $matches[] = [
                'a' => ['number' => $a['voter_number'], 'name' => $a['name'], 'gender' => $a['gender']],
                'b' => ['number' => $b['voter_number'], 'name' => $b['name'], 'gender' => $b['gender']],
            ];
        }
    }

    jsonOut([
        'ok'            => true,
        'partyId'       => $partyId,
        'partyTitle'    => (string)($found['title'] ?? ''),
        'voting_status' => (string)($found['voting_status'] ?? 'closed'),
        'votes'         => $votes,
        'matches'       => $matches,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body    = jsonBody();
$action  = (string)($body['action']  ?? '');
$partyId = trim((string)($body['partyId'] ?? ''));

if ($partyId === '')                                           jsonFail('partyId 가 필요합니다.');
if (!in_array($action, ['start', 'end', 'reset'], true))      jsonFail('unknown action');

$nextStatus = match ($action) {
    'start' => 'open',
    'end'   => 'finalized',
    'reset' => 'closed',
};

try {
    withFileLock($file, function (array $parties) use ($partyId, $nextStatus, $action): array {
        $found = false;
        foreach ($parties as &$p) {
            if ((string)($p['id'] ?? '') === $partyId) {
                $p['voting_status'] = $nextStatus;
                // end 액션 → 파티 자체 상태를 'completed' (모임종료) 로 전환.
                // start/reset 시 이전 'completed' 가 있었다면 해제(삭제).
                if ($action === 'end') {
                    $p['status'] = 'completed';
                } else {
                    unset($p['status']);
                }
                $found = true;
                break;
            }
        }
        unset($p);
        if (!$found) throw new RuntimeException('party not found');
        return $parties;
    });
} catch (Throwable $e) {
    error_log('[admin/matching POST] ' . $e->getMessage());
    jsonFail($e->getMessage(), 400);
}

// ── 모임 종료 시 일괄 booking 상태 전환 (confirmed → completed) ────────
//    cancelled / paid_pending_profile / pending_approval 등은 변경 안 함.
//    각 사용자별 bookings_<email_hash>.json 을 atomic 으로 갱신.
$migratedCount = 0;
if ($action === 'end') {
    $dataDir = dataDir();
    $files   = glob($dataDir . '/bookings_*.json') ?: [];
    foreach ($files as $bf) {
        $bfp = fopen($bf, 'c+');
        if (!$bfp) continue;
        if (!flock($bfp, LOCK_EX)) { fclose($bfp); continue; }
        $raw = stream_get_contents($bfp);
        $bookings = $raw ? json_decode($raw, true) : [];
        if (!is_array($bookings)) { flock($bfp, LOCK_UN); fclose($bfp); continue; }

        $changed = false;
        $now     = date('c');
        foreach ($bookings as &$b) {
            if (!is_array($b)) continue;
            if ((string)($b['partyId'] ?? '') !== $partyId) continue;
            if ((string)($b['status']  ?? '') !== 'confirmed') continue; // confirmed 만 대상
            $b['status']    = 'completed';
            $b['updatedAt'] = $now;
            $changed = true;
            $migratedCount++;
        }
        unset($b);

        if ($changed) {
            ftruncate($bfp, 0);
            rewind($bfp);
            fwrite($bfp, json_encode($bookings, JSON_UNESCAPED_UNICODE));
            fflush($bfp);
        }
        flock($bfp, LOCK_UN);
        fclose($bfp);
    }

    @file_put_contents("$dataDir/_admin_party_changes.log", sprintf(
        "[%s] adminId=%s party=%s VOTE_END → completed (bookings migrated=%d)\n",
        date('c'), $_SESSION['adminId'] ?? '?', $partyId, $migratedCount
    ), FILE_APPEND);
}

logAdminActivity('update', 'party', $partyId,
    $action === 'end'
        ? "매칭 투표 종료 — 파티 #{$partyId} 모임종료 처리 (참가확정 {$migratedCount}명 → 모임종료)"
        : "매칭 투표 상태 변경 — 파티 #{$partyId} → {$nextStatus}",
    null, ['voting_status' => $nextStatus, 'bookings_migrated' => $migratedCount]);

jsonOut([
    'ok' => true,
    'voting_status' => $nextStatus,
    'party_status'  => $action === 'end' ? 'completed' : null,
    'bookings_migrated' => $migratedCount,
]);
