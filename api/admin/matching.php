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
        // v6.4 매칭투표 관리페이지 — 상세 테이블에 연락처(phone) 노출 위해 u.phone 추가.
        $stmt = $pdo->prepare("
            SELECT v.voter_number, v.voter_gender, v.voter_email, v.picks,
                   u.name, u.phone, DATE_FORMAT(v.updated_at, '%Y-%m-%d %H:%i') AS updated_at
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
            'phone'        => formatPhone((string)($v['phone'] ?? '')),
            'picks'        => json_decode((string)$v['picks'], true) ?: [],
            'updated_at'   => (string)$v['updated_at'],
        ];
    }

    // ── 참가자 총원 집계 (남/여) + 투표시작 차단 카운트 ─────────────────────
    //    투표 완료 현황 배지 분모(participants) + 투표시작 가드(start_blocking).
    //    start_blocking = 'cancelled'/'confirmed' 이외(취소요청·확정대기·결제완료 등) 참가자 수.
    //      → 1명이라도 있으면 프런트에서 [투표시작] 차단. (read-only 스캔, 쓰기 X)
    $participants  = ['male' => 0, 'female' => 0];
    $startBlocking = 0;
    foreach (glob(dataDir() . '/bookings_*.json') ?: [] as $bf) {
        $raw = @file_get_contents($bf);
        if ($raw === false) continue;
        $rows = json_decode($raw, true);
        if (!is_array($rows)) continue;
        foreach ($rows as $b) {
            if (!is_array($b)) continue;
            if ((string)($b['partyId'] ?? '') !== $partyId) continue;
            $st = (string)($b['status'] ?? '');
            // 차단 카운트 — cancelled/confirmed 만 통과, 그 외 미완료 상태는 차단 대상
            if ($st !== 'cancelled' && $st !== 'confirmed') $startBlocking++;
            // 참가자 총원 — confirmed + completed 만 합산
            if ($st !== 'confirmed' && $st !== 'completed') continue;
            $g = (string)($b['gender'] ?? '');
            if     ($g === '남성') $participants['male']++;
            elseif ($g === '여성') $participants['female']++;
        }
    }

    // ── 상호 매칭 쌍 검색 ────────────────────────────────────────────────
    //    커플 1쌍 = (남성번호, 여성번호) 단일 식별. 기존 dedup 키는 성별 perspective
    //    (M/F) 를 키에 포함시켜 동일 커플이 남관점·여관점으로 2번 집계되는 버그가 있었음.
    //    → 키를 '남성번호-여성번호' 로 canonical 화하여 1쌍으로 고정 집계. (a/b 출력 shape 은 유지)
    $matches = [];
    $seen = [];
    foreach ($votes as $a) {
        foreach ($votes as $b) {
            if ($a['gender'] === $b['gender']) continue;
            if (!in_array($b['voter_number'], $a['picks'], true)) continue;
            if (!in_array($a['voter_number'], $b['picks'], true)) continue;
            $male   = $a['gender'] === '남성' ? $a : $b;
            $female = $a['gender'] === '남성' ? $b : $a;
            $key = $male['voter_number'] . '-' . $female['voter_number'];
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
        'participants'  => $participants,
        'start_blocking'=> $startBlocking,
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
    $adminId = (string)($_SESSION['adminId'] ?? '?');
    withFileLock($file, function (array $parties) use ($partyId, $nextStatus, $action, $adminId): array {
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
                // [투표시작] → 호스트(담당자) 컬럼에 버튼을 누른 관리자 아이디를 로그 형태로 자동 기록.
                //   현장에서 투표를 오픈한 담당자를 추적하기 위함. (host_name = '관리자아이디')
                if ($action === 'start') {
                    $p['host_name'] = $adminId;
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

// ── v6.8 투표 초기화 — 해당 party_id 의 모든 vote 레코드 삭제 + completed booking 역방향 마이그레이션 ──
//    삭제 대상: match_votes WHERE party_id = ? (해당 파티만, 다른 파티 데이터 절대 미접근)
//    booking 역마이그레이션: completed → confirmed (모임 종료 처리 되돌리기 → 재투표 가능)
//    절대 미터치: 회원 프로필(users), 결제 내역(payments/total/paymentId/tossOrderId), gender, createdAt, 다른 status(cancelled/pending_*)
$votesDeleted    = 0;
$revertedCount   = 0;
if ($action === 'reset') {
    // 1) match_votes 삭제 (party_id 단일 스코프)
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare("DELETE FROM match_votes WHERE party_id = ?");
        $stmt->execute([$partyId]);
        $votesDeleted = $stmt->rowCount();
    } catch (Throwable $e) {
        error_log('[admin/matching reset votes] ' . $e->getMessage());
    }

    // 2) bookings 역마이그레이션 completed → confirmed (해당 partyId 만)
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
            if ((string)($b['status']  ?? '') !== 'completed') continue; // completed 만 역대상
            $b['status']    = 'confirmed';
            $b['updatedAt'] = $now;
            $changed = true;
            $revertedCount++;
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
        "[%s] adminId=%s party=%s VOTE_RESET (votes_deleted=%d, bookings_reverted=%d)\n",
        date('c'), $_SESSION['adminId'] ?? '?', $partyId, $votesDeleted, $revertedCount
    ), FILE_APPEND);
}

logAdminActivity('update', 'party', $partyId,
    $action === 'end'
        ? "매칭 투표 종료 — 파티 #{$partyId} 모임종료 처리 (참가확정 {$migratedCount}명 → 모임종료)"
        : ($action === 'reset'
            ? "매칭 투표 초기화 — 파티 #{$partyId} (vote 레코드 {$votesDeleted}건 삭제, 모임종료 {$revertedCount}명 → 참가확정 복원)"
            : "매칭 투표 상태 변경 — 파티 #{$partyId} → {$nextStatus}"),
    null, ['voting_status' => $nextStatus, 'bookings_migrated' => $migratedCount, 'votes_deleted' => $votesDeleted, 'bookings_reverted' => $revertedCount]);

jsonOut([
    'ok' => true,
    'voting_status' => $nextStatus,
    'party_status'  => $action === 'end' ? 'completed' : null,
    'bookings_migrated' => $migratedCount,
    'votes_deleted'     => $votesDeleted,
    'bookings_reverted' => $revertedCount,
]);
