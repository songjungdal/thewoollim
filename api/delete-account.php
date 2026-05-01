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
