<?php
/**
 * 내 사진 심사 · 직업 인증 상태 (본인만).
 *
 * GET → {
 *   ok, ready(업로드 가능), photoRequired(결제 전 사진 승인 필요 — 관리자 스위치), testUser(검사 통과 회원),
 *   photo: { status:'none'|'pending'|'approved'|'rejected', approved, rejectReason, submittedAt, reviewedAt, approvedAt },
 *   job:   { status:'none'|'pending'|'approved'|'reverify'|'rejected', verified, label, jobType, rejectReason, submittedAt, reviewedAt }
 * }
 *  - 파일 경로·파일 이름은 내려주지 않는다. 사진은 my-photo.php 로만 본다.
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);
requireUser();

$userId = (int)currentUserId();
try {
    $stmt = getDB()->prepare("SELECT email, job FROM users WHERE id = ? AND status = 'active' LIMIT 1");
    $stmt->execute([$userId]);
    $u = $stmt->fetch();
    if (!$u) jsonFail('unauthorized', 401);
    $store = verifyReadStore();
} catch (Throwable $e) {
    error_log('[verification/state] ' . $e->getMessage());
    jsonFail('인증 상태를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 500);
}

jsonOut([
    'ok'            => true,
    'ready'         => verifyReady()['ready'],
    'photoRequired' => verifyPhotoRequired($store),
    'testUser'      => isTestUser((string)$u['email']),
    'photo'         => verifyPhotoSummary($store, $userId),
    'job'           => verifyJobSummary($store, $userId, (string)($u['job'] ?? '')),
]);
