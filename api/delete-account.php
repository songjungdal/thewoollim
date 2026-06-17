<?php
/**
 * 회원 탈퇴 (Soft Delete + 익명화).
 *
 * POST { email } → { ok: true }
 *  - status='withdrawn', withdrawn_at=NOW()
 *  - 개인정보 익명화: name='탈퇴회원', phone=NULL, email='deleted_<id>@withdrawn.local',
 *    sns_user_id=NULL, sns_access_token=NULL
 *  - 결제·예약 데이터는 결제 추적 목적상 보존 (cancelled 처리는 별도)
 *
 * 본인 계정만 — email 이 세션과 일치 + 실행 후 즉시 세션 파괴.
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body  = jsonBody();
$email = normalizeEmail((string)($body['email'] ?? ''));
requireUser($email);

// ── 사전 검증 — '진행 중인 매칭 파티'가 있으면 탈퇴 차단 (v6.2 정밀 보정) ─────────
//    진행 중 = status ∈ {paid_pending_profile, pending_approval, confirmed} AND 행사일이 아직 안 지남.
//    completed(모임종료)/cancelled(취소됨), 또는 행사일이 지난 과거 파티는 '정리 완료'로 보고 제외.
$bookingsFile = dataDir() . '/bookings_' . md5(strtolower(trim($email))) . '.json';
if (file_exists($bookingsFile)) {
    $bookings = json_decode((string)file_get_contents($bookingsFile), true);
    if (is_array($bookings)) {
        // parties.json → calendarDate 조회용 맵
        $partyMap = [];
        $parties = json_decode((string)@file_get_contents(dataDir() . '/parties.json'), true);
        foreach ((array)$parties as $p) {
            if (isset($p['id'])) $partyMap[(string)$p['id']] = $p;
        }
        $today    = date('Y-m-d');
        $blocking = ['paid_pending_profile', 'pending_approval', 'confirmed'];
        foreach ($bookings as $b) {
            if (!is_array($b)) continue;
            if (!in_array((string)($b['status'] ?? ''), $blocking, true)) continue;
            // 행사일(calendarDate) 이 오늘 이전(=과거)이면 차단 대상에서 제외. 파티 없으면(삭제) 제외.
            $cal = (string)($partyMap[(string)($b['partyId'] ?? '')]['calendarDate'] ?? '');
            if ($cal === '' || $cal < $today) continue;
            jsonFail(
                "잠시만요! 아직 진행 중인 매칭 파티가 남아있어요.\n" .
                "현재 진행 대기 중인 매칭 파티가 있습니다.\n" .
                "탈퇴 버튼 바로 옆에 있는 [취소요청] 버튼을 눌러 먼저 정리를 마쳐주세요.\n" .
                "모든 신청 내역이 취소된 후에 회원 탈퇴가 가능합니다.",
                409
            );
        }
    }
}

try {
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? AND status='active' LIMIT 1");
    $stmt->execute([$email]);
    $u = $stmt->fetch();
    if (!$u) jsonFail('이미 탈퇴된 계정입니다.', 410);

    $userId = (int)$u['id'];
    $anonEmail = 'deleted_' . $userId . '_' . bin2hex(random_bytes(4)) . '@withdrawn.local';

    $stmt = $pdo->prepare("
        UPDATE users
           SET status        = 'withdrawn',
               withdrawn_at  = NOW(),
               name          = '탈퇴회원',
               nickname      = NULL,
               phone         = NULL,
               sns_user_id   = NULL,
               sns_access_token = NULL,
               email         = ?
         WHERE id = ?
    ");
    $stmt->execute([$anonEmail, $userId]);

    // ── booking 파일 rename — 익명화된 email 의 hash 로 이동해서 admin 이 계속 조회 가능 ─
    $oldHash = md5(strtolower(trim($email)));
    $newHash = md5(strtolower(trim($anonEmail)));
    $oldFile = dataDir() . '/bookings_' . $oldHash . '.json';
    $newFile = dataDir() . '/bookings_' . $newHash . '.json';
    if (file_exists($oldFile)) {
        @rename($oldFile, $newFile);
    }

    @file_put_contents(
        dataDir() . '/_account_deletions.log',
        sprintf("[%s] withdrawn userId=%d originalEmail=%s ip=%s\n",
            date('c'), $userId, $email, $_SERVER['REMOTE_ADDR'] ?? '-'),
        FILE_APPEND
    );
} catch (Throwable $e) {
    error_log('[delete-account] ' . $e->getMessage());
    jsonFail('처리 중 오류가 발생했습니다.', 500);
}

logoutUserSession();
jsonOut(['ok' => true]);
