<?php
/**
 * 결제 링크 — 토스 결제 성공 이동 → 승인 (docs/specs/paylink.md 4-2).
 * 토스 → /api/paylink/success.php?paymentKey=...&orderId=pl<번호>_...&amount=...
 *
 *  1) orderId 로 링크를 찾고, 그 링크가 발급한 10분 안의 주문인지 확인
 *  2) amount 가 주문 금액·링크 금액과 같은지 확인 — 다르면 승인하지 않는다
 *  3) 링크 잠금을 잡은 채로 이미 결제 완료인지 확인 → 아니면 토스 승인
 *  4) 승인 성공 → 결제 완료 기록 → /pay/?t=…&done=1 (알림은 이동 응답을 보낸 뒤)
 *  5) 승인 뒤 저장 실패, 또는 다른 창에서 이미 결제된 링크 → 이번 결제 전액 자동 취소 후 안내
 *     (주소의 paymentKey 는 브라우저가 보낸 값이므로, 취소 전에 토스에서 그 결제의 orderId 가 이 링크가 발급한 주문인지 확인한다)
 *  6) 새로고침 — 이미 기록된 주문이면 다시 승인하지 않고 완료 화면으로
 *
 * 기존 파티 결제(api/payments/success.php)와 파일·저장소를 섞지 않는다.
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
header('Cache-Control: no-store, no-cache, must-revalidate');

$paymentKey = trim((string)($_GET['paymentKey'] ?? ''));
$orderId    = trim((string)($_GET['orderId'] ?? ''));
$amount     = (int)($_GET['amount'] ?? 0);

function plGo(string $token, string $msg): void {
    paylinkRedirectThen(paylinkSiteUrl() . '/pay/?' . ($token !== '' ? 't=' . $token . '&' : '') . 'error=' . rawurlencode($msg));
}
function plLog(string $file, string $line): void {
    @file_put_contents(dataDir() . '/' . $file, '[' . date('c') . '] ' . $line . "\n", FILE_APPEND);
}

/** 이번 결제 전액 자동 취소 → 결제자 안내 문구 */
function plAutoCancel(array $cfg, string $paymentKey, string $orderId, int $amount, string $reason, string $tag): string {
    $r = paylinkTossCancel($cfg, $paymentKey, $amount, $reason);
    if ($r['ok']) {
        plLog('_paylink_failure_alert.log', "{$tag}_AUTO_CANCEL orderId=$orderId amount=$amount http={$r['http']}");
        return '';
    }
    plLog('_paylink_failure_alert.log', "CRITICAL {$tag}_AUTO_CANCEL_FAILED orderId=$orderId paymentKey=$paymentKey amount=$amount http={$r['http']} msg={$r['message']} — 토스 결제 승인 상태. 수동 환불 필요.");
    error_log("[paylink/success] CRITICAL auto cancel failed ($tag): orderId=$orderId");
    return '결제 취소 처리 중 문제가 발생해 운영팀이 확인 후 환불해드립니다. 담당자에게 문의해주세요';
}

/** 주문 하나 지우기 (실패해도 무시) */
function plRemoveOrder(int $id, string $orderId): void {
    try {
        paylinkMutate(function (array &$store) use ($id, $orderId) {
            $i = paylinkIndex($store, $id);
            if ($i !== null) $store['links'][$i]['orders'] = array_values(array_filter((array)($store['links'][$i]['orders'] ?? []),
                fn($o) => is_array($o) && (string)($o['orderId'] ?? '') !== $orderId));
            return null;
        });
    } catch (Throwable $e) {}
}

$id = paylinkIdFromOrderId($orderId);
if ($paymentKey === '' || strlen($paymentKey) > 200 || !preg_match('/^[A-Za-z0-9_\-=]+$/', $paymentKey) || $id === 0 || $amount <= 0) {
    plGo('', '잘못된 결제 응답입니다.');
}
$link = paylinkFindById($id);
if ($link === null) plGo('', '잘못된 결제 링크입니다.');
$token = (string)$link['token'];

$cfg = paylinkTossConfig();
if ($cfg === null) {
    plLog('_paylink_toss.log', 'CONFIG secret_key 형식 비정상');
    plGo($token, '결제 시스템 설정 오류입니다. 담당자에게 문의해주세요.');
}

try {
    $outcome = paylinkWithLinkLock($id, function () use ($id, $orderId, $paymentKey, $amount, $cfg): array {
        $l = paylinkFindById($id);
        if ($l === null) return ['fail', '잘못된 결제 링크입니다.'];
        $pay = (array)($l['payment'] ?? []);
        if ((string)($pay['orderId'] ?? '') === $orderId) return ['done', ''];   // 새로고침·토스 재이동

        $allOrders = array_values(array_filter((array)($l['orders'] ?? []), 'is_array'));
        $order = null;
        foreach ($allOrders as $o) if ((string)($o['orderId'] ?? '') === $orderId) $order = $o;

        // 다른 창에서 이미 결제된 링크 — 이번 결제가 승인된 상태면 즉시 전액 취소
        if (in_array((string)($l['status'] ?? ''), ['paid', 'partial_cancelled', 'cancelled'], true)) {
            if ($order === null) return ['fail', '이미 결제가 완료된 링크입니다.'];
            $g = paylinkTossRequest($cfg, 'GET', '/v1/payments/' . rawurlencode($paymentKey));
            $gOrder = (string)($g['json']['orderId'] ?? '');
            $gStatus = (string)($g['json']['status'] ?? '');
            plRemoveOrder($id, $orderId);
            if ($g['http'] === 200 && $gOrder === $orderId && in_array($gStatus, ['DONE', 'PARTIAL_CANCELED'], true)) {
                $m = plAutoCancel($cfg, $paymentKey, $orderId, (int)($g['json']['balanceAmount'] ?? $amount), '이미 결제된 링크 중복 결제로 자동 취소', 'DUPLICATE');
                return ['fail', '이미 결제가 완료된 링크입니다. ' . ($m === '' ? '이번 결제는 자동 취소되었습니다.' : $m)];
            }
            if ($g['http'] === 200 && $gOrder === $orderId) {
                return ['fail', '이미 결제가 완료된 링크입니다. 이번 결제는 승인되지 않았습니다.'];
            }
            plLog('_paylink_failure_alert.log', "DUPLICATE_CHECK_FAILED orderId=$orderId http={$g['http']} — 이미 결제된 링크에 결제 시도. 토스 결제 내역 확인 필요.");
            return ['fail', '이미 결제가 완료된 링크입니다. 카드 승인 문자를 받으셨다면 담당자에게 문의해주세요.'];
        }

        if ($order === null) return ['fail', '주문을 찾을 수 없습니다. 다시 결제해주세요.'];
        if ((int)($order['issuedAt'] ?? 0) + PAYLINK_ORDER_TTL < time()) {
            plRemoveOrder($id, $orderId);
            return ['fail', '주문 시간이 지났습니다. 다시 결제해주세요.'];
        }
        if ($amount !== (int)($order['amount'] ?? -1) || $amount !== (int)($l['amount'] ?? -2)) {
            plLog('_paylink_amount_mismatch.log', sprintf('orderId=%s link=%d order=%d got=%d', $orderId, (int)$l['amount'], (int)($order['amount'] ?? 0), $amount));
            plRemoveOrder($id, $orderId);
            return ['fail', '결제 금액이 일치하지 않습니다.'];
        }
        if ((string)($l['status'] ?? '') !== 'open') {
            plRemoveOrder($id, $orderId);
            return ['fail', '현재 결제할 수 없는 링크입니다. 담당자에게 문의해주세요.'];
        }

        // ── 토스 승인
        $r = paylinkTossRequest($cfg, 'POST', '/v1/payments/confirm', ['paymentKey' => $paymentKey, 'orderId' => $orderId, 'amount' => $amount]);
        $code = (string)($r['json']['code'] ?? '');
        $payObj = $r['http'] === 200 ? $r['json'] : null;
        if ($payObj === null && ($r['http'] === 0 || ($r['http'] === 400 && $code === 'ALREADY_PROCESSED_PAYMENT') || $r['http'] >= 500)) {
            // 연결 실패·이미 승인됨·토스 오류 — 실제 결제 상태를 조회해 승인돼 있으면 그대로 기록
            $g = paylinkTossRequest($cfg, 'GET', '/v1/payments/' . rawurlencode($paymentKey));
            if ($g['http'] === 200 && (string)($g['json']['orderId'] ?? '') === $orderId && (string)($g['json']['status'] ?? '') === 'DONE') {
                $payObj = $g['json'];
            } elseif ($r['http'] === 0 || $r['http'] >= 500 || $code === 'ALREADY_PROCESSED_PAYMENT') {
                plLog('_paylink_failure_alert.log', "CONFIRM_UNKNOWN orderId=$orderId http={$r['http']} get={$g['http']} — 승인 여부 확인 필요.");
                return ['fail', '결제 서버 연결이 원활하지 않습니다. 카드 승인 문자를 받으셨다면 담당자에게 문의해주세요.'];
            }
        }
        if ($payObj === null) {
            plLog('_paylink_toss.log', "CONFIRM_FAIL orderId=$orderId http={$r['http']} code=$code");
            plRemoveOrder($id, $orderId);
            $tm = (string)($r['json']['message'] ?? '');
            return ['fail', $tm !== '' ? "결제 승인 실패: $tm" : "결제 승인이 거절되었습니다 (HTTP {$r['http']})"];
        }
        if ((int)($payObj['totalAmount'] ?? $amount) !== $amount || (string)($payObj['orderId'] ?? $orderId) !== $orderId) {
            $m = plAutoCancel($cfg, $paymentKey, $orderId, $amount, '결제 정보 불일치로 자동 취소', 'MISMATCH');
            plRemoveOrder($id, $orderId);
            return ['fail', '결제 정보가 일치하지 않습니다. ' . ($m === '' ? '결제는 자동 취소되었습니다.' : $m)];
        }

        // ── 결제 완료 기록
        $info = paylinkPaymentInfo($payObj);
        try {
            paylinkMutate(function (array &$store) use ($id, $orderId, $paymentKey, $amount, $order, $info) {
                $i = paylinkIndex($store, $id);
                if ($i === null) throw new RuntimeException('link missing');
                $x = &$store['links'][$i];
                if ((string)($x['status'] ?? '') !== 'open') throw new RuntimeException('status changed: ' . (string)($x['status'] ?? ''));
                $now = date('Y-m-d H:i:s');
                $x['status']  = 'paid';
                $x['payment'] = [
                    'orderId' => $orderId, 'paymentKey' => $paymentKey, 'amount' => $amount,
                    'method' => $info['method'], 'approvedAt' => $info['approvedAt'], 'receiptUrl' => $info['receiptUrl'],
                    'payerName' => (string)($order['payerName'] ?? ''), 'payerPhone' => (string)($order['payerPhone'] ?? ''),
                ];
                $x['refundPolicy'] = paylinkRefundPolicy();   // 결제 시점 규정 그대로 보존
                $x['cancelledAmount'] = 0;
                $x['cancels'] = [];
                $x['prepareHits'] = [];
                $x['updatedAt'] = $now;
                return null;
            });
        } catch (Throwable $e) {
            error_log('[paylink/success save] ' . $e->getMessage());
            $m = plAutoCancel($cfg, $paymentKey, $orderId, $amount, '결제 기록 저장 실패로 자동 취소', 'SAVE_FAILED');
            return ['fail', '결제 처리 중 문제가 발생했습니다. ' . ($m === '' ? '결제는 자동 취소되었습니다.' : $m)];
        }
        plLog('_paylink_toss.log', "APPROVED link=$id orderId=$orderId amount=$amount");
        return ['paid', ''];
    });
} catch (PaylinkError $e) {
    plGo($token, $e->getMessage());
}

$doneUrl = paylinkSiteUrl() . '/pay/?t=' . $token . '&done=1';
if ($outcome[0] === 'paid') {
    require_once __DIR__ . '/_notify.php';
    paylinkRedirectThen($doneUrl, fn() => paylinkNotifyPaid($id));
}
if ($outcome[0] === 'done') paylinkRedirectThen($doneUrl);
plGo($token, $outcome[1]);
