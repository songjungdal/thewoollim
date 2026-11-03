<?php
/**
 * 결제 링크 — 결제 직전 주문번호 발급 (docs/specs/paylink.md 4-1). 로그인 없음.
 * POST { t, payerName, payerPhone, agreeRefund, agreePrivacy }
 *  → { ok, orderId, amount, orderName, customerName, customerMobilePhone }
 *
 *  - 금액은 저장된 링크 금액만 쓴다(화면에서 보낸 금액은 받지 않음)
 *  - 결제 대기·기한 안·중지 아님일 때만. 주문번호는 10분 유효(success.php 가 다시 확인)
 *  - 같은 링크 10분에 10회까지
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);
$body = jsonBody();

$token = trim((string)($body['t'] ?? ''));
$name  = paylinkCleanLine($body['payerName'] ?? '', PAYLINK_PAYER_NAME_MAX);
$phone = preg_replace('/\D+/', '', (string)($body['payerPhone'] ?? '')) ?? '';
if (!paylinkTokenValid($token)) jsonFail('잘못된 결제 링크입니다.', 404, ['status' => 'not_found']);
if ($name === '' || mb_strlen($name) > PAYLINK_PAYER_NAME_MAX) jsonFail('결제자 이름을 ' . PAYLINK_PAYER_NAME_MAX . '자 이내로 입력해주세요.');
if (!preg_match('/^01\d{8,9}$/', $phone)) jsonFail('휴대폰 번호를 01로 시작하는 10~11자리 숫자로 입력해주세요.');
if (($body['agreeRefund'] ?? null) !== true || ($body['agreePrivacy'] ?? null) !== true) jsonFail('필수 항목에 모두 동의해주세요.');

$STATE_MSG = [
    'expired'           => '결제 기한이 지난 링크입니다. 담당자에게 문의해주세요.',
    'stopped'           => '현재 결제할 수 없는 링크입니다. 담당자에게 문의해주세요.',
    'paid'              => '이미 결제가 완료된 링크입니다.',
    'partial_cancelled' => '이미 결제가 완료된 링크입니다.',
    'cancelled'         => '취소된 결제입니다.',
];

try {
    $res = paylinkMutate(function (array &$store) use ($token, $name, $phone, $STATE_MSG) {
        $idx = null;
        foreach ($store['links'] as $i => $l) if (hash_equals((string)($l['token'] ?? ''), $token)) { $idx = $i; break; }
        if ($idx === null) throw new PaylinkError('잘못된 결제 링크입니다.', 404);
        $l = &$store['links'][$idx];
        $now = time();
        $state = paylinkState($l, $now);
        if ($state !== 'open') throw new PaylinkError($STATE_MSG[$state] ?? '결제할 수 없는 링크입니다.', 409);

        $hits = array_values(array_filter((array)($l['prepareHits'] ?? []), fn($t) => (int)$t > $now - PAYLINK_ORDER_TTL));
        if (count($hits) >= PAYLINK_PREPARE_LIMIT) throw new PaylinkError('결제 요청이 너무 많습니다. 10분 뒤에 다시 시도해주세요.', 429);
        $hits[] = $now;
        $l['prepareHits'] = $hits;

        $orderId = paylinkNewOrderId((int)$l['id']);
        $orders = paylinkLiveOrders($l, $now);
        $orders[] = ['orderId' => $orderId, 'issuedAt' => $now, 'amount' => (int)$l['amount'], 'payerName' => $name, 'payerPhone' => $phone];
        $l['orders'] = $orders;
        return ['orderId' => $orderId, 'amount' => (int)$l['amount'], 'orderName' => (string)$l['title']];
    });
} catch (PaylinkError $e) {
    jsonFail($e->getMessage(), $e->http);
} catch (Throwable $e) {
    error_log('[paylink/prepare] ' . $e->getMessage());
    jsonFail('주문을 만들지 못했습니다. 잠시 후 다시 시도해주세요.', 500);
}

jsonOut(['ok' => true] + $res + ['customerName' => $name, 'customerMobilePhone' => $phone]);
