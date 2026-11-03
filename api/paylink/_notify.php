<?php
/**
 * 결제 링크 알림 (docs/specs/paylink.md 4-4). 모든 함수는 예외를 밖으로 던지지 않는다 — 알림 실패가 결제·취소에 영향을 주면 안 된다.
 *  - 운영자 텔레그램: 설정이 켜져 있을 때만(telegramSend 가 판단), 무음 시간 규칙도 telegramSend 그대로.
 *    결제자 이름·연락처는 넣지 않는다 — 결제명·금액·링크 번호·처리 관리자 아이디만.
 *  - 결제자 문자: 결제 완료 때 1회 (smsSentAt 으로 한 번만).
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/../notify/_telegram.php';

function paylinkNotifyPaid(int $id): void {
    try {
        $l = paylinkFindById($id);
        if ($l === null || !in_array((string)($l['status'] ?? ''), ['paid', 'partial_cancelled', 'cancelled'], true)) return;
        telegramSend(implode("\n", [
            '[어울림] 대관료 결제 완료',
            '· ' . (string)$l['title'],
            '· ' . number_format((int)$l['amount']) . '원',
            '· 링크 #' . $id,
        ]));
    } catch (Throwable $e) {
        error_log('[paylink notify paid tg] ' . $e->getMessage());
    }

    // 결제자 문자 — 한 번만 (먼저 표시해 두고 보낸다: 동시에 두 번 불려도 한 번만 발송)
    try {
        $claim = paylinkMutate(function (array &$store) use ($id) {
            $i = paylinkIndex($store, $id);
            if ($i === null || !empty($store['links'][$i]['smsSentAt'])) return null;
            $store['links'][$i]['smsSentAt'] = date('Y-m-d H:i:s');
            return $store['links'][$i];
        });
        if (!is_array($claim)) return;
        $p = (array)($claim['payment'] ?? []);
        $phone = (string)($p['payerPhone'] ?? '');
        $receipt = (string)($p['receiptUrl'] ?? '');
        $msg = '[어울림] ' . (string)$claim['title'] . ' ' . number_format((int)$claim['amount']) . '원 결제가 완료되었습니다.'
            . ($receipt !== '' ? ' 영수증: ' . $receipt : '');
        $r = paylinkSendSms($phone, $msg, '[어울림] 결제 완료', "paid link=$id");
        paylinkMutate(function (array &$store) use ($id, $r) {
            $i = paylinkIndex($store, $id);
            if ($i !== null) $store['links'][$i]['smsResult'] = $r['ok'] ? 'sent' : 'fail';
            return null;
        });
    } catch (Throwable $e) {
        error_log('[paylink notify paid sms] ' . $e->getMessage());
    }
}

/** 취소 (무음) */
function paylinkNotifyCancel(array $l, int $amount, string $adminId): void {
    try {
        telegramSend(implode("\n", [
            '[어울림] 결제 취소 · ' . number_format($amount) . '원',
            '· ' . (string)$l['title'],
            '· 처리: ' . $adminId,
        ]), true);
    } catch (Throwable $e) {
        error_log('[paylink notify cancel] ' . $e->getMessage());
    }
}
