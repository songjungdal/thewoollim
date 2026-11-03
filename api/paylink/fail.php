<?php
/**
 * 결제 링크 — 토스 결제 실패·취소 이동 (docs/specs/paylink.md 4-1).
 * 토스 → /api/paylink/fail.php?code=...&message=...&orderId=...
 * 그 주문번호를 정리하고 /pay/?t=<링크 코드>&error=<안내> 로 보낸다 (결제자가 다시 시도할 수 있음).
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
header('Cache-Control: no-store, no-cache, must-revalidate');

$orderId = trim((string)($_GET['orderId'] ?? ''));
$code    = trim((string)($_GET['code'] ?? ''));
$message = trim((string)($_GET['message'] ?? ''));
if ($message === '' || in_array($code, ['PAY_PROCESS_CANCELED', 'USER_CANCEL'], true)) $message = '결제가 취소되었습니다.';
$message = mb_substr($message, 0, 200);

$id = paylinkIdFromOrderId($orderId);
$token = '';
if ($id > 0) {
    try {
        $token = (string)paylinkMutate(function (array &$store) use ($id, $orderId) {
            $i = paylinkIndex($store, $id);
            if ($i === null) return '';
            $store['links'][$i]['orders'] = array_values(array_filter(paylinkLiveOrders($store['links'][$i]),
                fn($o) => (string)($o['orderId'] ?? '') !== $orderId));
            return (string)($store['links'][$i]['token'] ?? '');
        });
    } catch (Throwable $e) {
        $l = paylinkFindById($id);
        $token = (string)($l['token'] ?? '');
    }
}

@file_put_contents(dataDir() . '/_paylink_toss.log', sprintf("[%s] FAIL orderId=%s code=%s msg=%s\n",
    date('c'), $orderId, $code, mb_substr($message, 0, 120)), FILE_APPEND);

paylinkRedirectThen(paylinkSiteUrl() . '/pay/?' . ($token !== '' ? 't=' . $token . '&' : '') . 'error=' . rawurlencode($message));
