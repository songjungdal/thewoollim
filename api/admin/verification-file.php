<?php
/**
 * 관리자 — 인증 사진·서류 보기 (관리자 세션만, docs/specs/photo-job-verification.md 4-1).
 *
 * GET ?id=<기록 번호>&slot=1|2 → image/jpeg   (직업 서류는 slot=1)
 *  - 파일은 웹 루트 밖에 있어 이 API 로만 볼 수 있다. 지워진 파일은 404
 *  - 열람을 관리자 활동 로그에 남긴다(누가 언제 누구의 사진·서류를 봤는지). 같은 관리자가 같은 기록을 10분 안에 다시 보면 한 번만 남긴다
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
require_once __DIR__ . '/../verification/_lib.php';

if (!adminIsLoggedIn()) { jsonHeaders(); jsonFail('unauthorized', 401); }
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { jsonHeaders(); jsonFail('method not allowed', 405); }

$id   = (int)($_GET['id'] ?? 0);
$slot = (int)($_GET['slot'] ?? 1);
if ($id <= 0 || $slot < 1 || $slot > 2) { jsonHeaders(); jsonFail('bad request', 400); }

try {
    $rec = null;
    foreach (verifyReadStore()['records'] as $r) if (is_array($r) && (int)($r['id'] ?? 0) === $id) $rec = $r;
} catch (Throwable $e) {
    jsonHeaders(); jsonFail('잠시 후 다시 시도해주세요.', 500);
}
$path = ($rec !== null && empty($rec['files_deleted_at'])) ? verifyFilePath((string)($rec['files'][$slot - 1] ?? '')) : null;
if ($path === null) { jsonHeaders(); jsonFail('not found', 404); }

$seen = (array)($_SESSION['verifyViewed'] ?? []);
if ((int)($seen[$id] ?? 0) < time() - 600) {
    $seen[$id] = time();
    $_SESSION['verifyViewed'] = array_slice($seen, -200, null, true);
    $email = ''; $name = '';
    try {
        $stmt = getDB()->prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([(int)$rec['user_id']]);
        $who = $stmt->fetch() ?: [];
        $email = (string)($who['email'] ?? ''); $name = (string)($who['name'] ?? '');
    } catch (Throwable $e) {}
    $kindLabel = ($rec['kind'] ?? '') === 'job' ? '직업 서류' : '사진';
    logAdminActivity('view', 'verification', $email !== '' ? $email : (string)$rec['user_id'],
        "{$kindLabel} 열람 — " . ($name !== '' ? $name : "회원 #{$rec['user_id']}") . " (기록 #{$id})",
        null, null, ['구분' => $kindLabel, '회원' => "{$name} ({$email})", '기록 번호' => (string)$id, '기록 상태' => (string)($rec['status'] ?? '')]);
}
session_write_close();
verifySendImage($path);
