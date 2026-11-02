<?php
/**
 * 내 사진 미리보기 (본인 세션만).
 *
 * GET ?slot=1|2[&which=pending|approved] → image/jpeg
 *  - which 를 주지 않으면 심사 중 사진, 없으면 승인 사진, 없으면 마지막 반려 사진(파일이 남아 있을 때)
 *  - 다른 회원의 사진은 볼 수 없다(세션의 회원 번호로만 찾는다). 없으면 404
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/../auth/_session.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { jsonHeaders(); jsonFail('method not allowed', 405); }
if (!userIsLoggedIn()) { jsonHeaders(); jsonFail('unauthorized', 401); }

$userId = (int)currentUserId();
$slot   = (int)($_GET['slot'] ?? 0);
$which  = (string)($_GET['which'] ?? '');
if ($slot !== 1 && $slot !== 2) { jsonHeaders(); jsonFail('slot', 400); }

try {
    $recs = verifyUserRecords(verifyReadStore(), $userId, 'photo');
} catch (Throwable $e) {
    jsonHeaders(); jsonFail('잠시 후 다시 시도해주세요.', 500);
}
$order = $which === 'approved' ? ['approved'] : ($which === 'pending' ? ['pending'] : ['pending', 'approved', 'rejected']);
foreach ($order as $st) {
    $rec = verifyLatestWithStatus($recs, [$st]);
    if ($rec === null || !empty($rec['files_deleted_at'])) continue;
    $path = verifyFilePath((string)($rec['files'][$slot - 1] ?? ''));
    if ($path !== null) verifySendImage($path);
}
jsonHeaders();
jsonFail('not found', 404);
