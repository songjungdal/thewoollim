<?php
/**
 * Toss 결제 실패/취소 redirect 핸들러.
 * Toss → /api/payments/fail.php?code=...&message=...&orderId=...
 *
 * pending 파일 즉시 삭제 후 /checkout 으로 redirect (사용자가 재시도 가능).
 */

declare(strict_types=1);
header('Cache-Control: no-store, no-cache, must-revalidate');

$orderId = trim((string)($_GET['orderId'] ?? ''));
$code    = trim((string)($_GET['code']    ?? ''));
$message = trim((string)($_GET['message'] ?? '결제가 취소되었습니다.'));

if ($orderId !== '' && preg_match('/^[A-Za-z0-9_\-]+$/', $orderId)) {
    @unlink(__DIR__ . '/../data/pending/' . $orderId . '.json');
}

@file_put_contents(__DIR__ . '/../data/_toss_fail.log', sprintf(
    "[%s] orderId=%s code=%s msg=%s\n",
    date('c'), $orderId, $code, substr($message, 0, 200)
), FILE_APPEND);

header('Location: https://thewoollim.com/checkout/?error=' . urlencode($message));
exit;
