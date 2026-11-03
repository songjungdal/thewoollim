<?php
/**
 * 관리자 — 대관료 결제 링크 (docs/specs/paylink.md 2장·4장). 관리자 세션 필수.
 *
 * GET              → { ok, ready, reason, links:[목록 줄], summary:{ month, paidCount, paidAmount, cancelAmount } }
 * GET ?id=<번호>   → { ok, link:{상세} }
 * POST { action:'create', title, amount, useDate, useInfo?, payerName?, payerPhone?, notice?, expiresAt?, adminMemo? } → { ok, link }
 * POST { action:'update', id, (create 와 같은 항목) }   결제 대기일 때만, 결제 진행 중(주문이 살아 있는 10분)에는 안 됨
 * POST { action:'stop', id } / { action:'reopen', id }  중지는 결제 대기일 때만, 다시 열기는 기한 안에서만
 * POST { action:'send_sms', id }                         결제자 연락처로 결제 요청 문자 (알리고, 실제 발송)
 * POST { action:'cancel', id, full:bool, amount?, reason } 결제 완료·부분 취소일 때. 부분 취소는 남은 결제 금액 이하
 *
 *  - 금액·기한·상태는 모두 서버가 최종 판단한다(화면 값은 참고만)
 *  - 규정상 환불 금액은 api/lib.php refundQuote(남은 결제액, 이용일) — 파티와 같은 규정
 *  - 만들기·수정·중지·다시 열기·문자 발송·취소는 관리자 활동 로그에 남긴다(결제자 연락처는 남기지 않음)
 *  - 삭제 기능은 없다(결제 기록 보존)
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
require_once __DIR__ . '/../paylink/_lib.php';
jsonHeaders();
adminRequire();

function plRow(array $l): array {
    $p = (array)($l['payment'] ?? []);
    return [
        'id' => (int)$l['id'], 'title' => (string)$l['title'], 'amount' => (int)$l['amount'],
        'state' => paylinkState($l), 'useDate' => (string)$l['useDate'], 'expiresAt' => (string)$l['expiresAt'],
        'createdAt' => (string)$l['createdAt'], 'paidAt' => (string)($p['approvedAt'] ?? ''),
        'cancelledAmount' => paylinkCancelledAmount($l),
    ];
}

function plDetail(array $l): array {
    $now = time();
    $state = paylinkState($l, $now);
    $p = (array)($l['payment'] ?? []);
    $paidLike = in_array($state, ['paid', 'partial_cancelled'], true);
    return plRow($l) + [
        'url' => paylinkPayUrl((string)$l['token']),
        'useInfo' => (string)($l['useInfo'] ?? ''), 'notice' => (string)($l['notice'] ?? ''), 'adminMemo' => (string)($l['adminMemo'] ?? ''),
        'payerName' => (string)($l['payerName'] ?? ''), 'payerPhone' => (string)($l['payerPhone'] ?? ''),
        'payment' => $p ? [
            'method' => (string)($p['method'] ?? ''), 'approvedAt' => (string)($p['approvedAt'] ?? ''), 'receiptUrl' => (string)($p['receiptUrl'] ?? ''),
            'payerName' => (string)($p['payerName'] ?? ''), 'payerPhone' => (string)($p['payerPhone'] ?? ''), 'amount' => (int)($p['amount'] ?? 0),
        ] : null,
        'refundPolicy' => is_array($l['refundPolicy'] ?? null) ? $l['refundPolicy'] : null,
        'cancels' => array_values((array)($l['cancels'] ?? [])),
        'remaining' => paylinkRemaining($l),
        'quote' => $paidLike ? paylinkRefundQuote($l, $now) : null,
        'inProgress' => $state === 'open' && paylinkLiveOrders($l, $now) !== [],
        'canReopen' => $state === 'stopped' && strtotime((string)$l['expiresAt']) > $now,
        'smsLog' => array_values((array)($l['smsLog'] ?? [])),
        'payerSms' => (string)($l['smsResult'] ?? ''),
        'createdBy' => (string)($l['createdBy'] ?? ''), 'updatedBy' => (string)($l['updatedBy'] ?? ''), 'updatedAt' => (string)($l['updatedAt'] ?? ''),
    ];
}

/** 활동 로그 상세 (결제자 연락처 없음) */
function plLogDetail(array $l, array $extra = []): array {
    return ['링크' => '#' . (int)$l['id'], '결제명' => (string)$l['title'], '금액' => number_format((int)$l['amount']) . '원',
            '이용일' => (string)$l['useDate'], '결제 기한' => (string)$l['expiresAt']] + $extra;
}

function plFail(Throwable $e, string $tag): void {
    if ($e instanceof PaylinkError) jsonFail($e->getMessage(), $e->http);
    error_log("[admin/paylinks $tag] " . $e->getMessage());
    jsonFail('처리하지 못했습니다.', 500);
}

$adminId = (string)($_SESSION['adminId'] ?? '?');
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $store = paylinkRead();
    if (isset($_GET['id'])) {
        $i = paylinkIndex($store, (int)$_GET['id']);
        if ($i === null) jsonFail('결제 링크를 찾을 수 없습니다.', 404);
        jsonOut(['ok' => true, 'link' => plDetail($store['links'][$i])]);
    }
    $links = $store['links'];
    usort($links, fn($a, $b) => (int)$b['id'] <=> (int)$a['id']);
    $month = date('Y-m');
    $paidCount = 0; $paidAmount = 0; $cancelAmount = 0;
    foreach ($links as $l) {
        if (str_starts_with((string)($l['payment']['approvedAt'] ?? ''), $month)) { $paidCount++; $paidAmount += (int)$l['amount']; }
        foreach ((array)($l['cancels'] ?? []) as $c) if (str_starts_with((string)($c['at'] ?? ''), $month)) $cancelAmount += (int)($c['amount'] ?? 0);
    }
    $ready = paylinkStorePath() !== null;
    jsonOut([
        'ok' => true, 'ready' => $ready, 'reason' => $ready ? '' : '웹 루트 밖 데이터 폴더가 없어 결제 링크를 만들 수 없습니다.',
        'links' => array_map('plRow', $links),
        'summary' => ['month' => $month, 'paidCount' => $paidCount, 'paidAmount' => $paidAmount, 'cancelAmount' => $cancelAmount],
        'limits' => ['amountMin' => PAYLINK_AMOUNT_MIN, 'amountMax' => PAYLINK_AMOUNT_MAX, 'deadlineDays' => PAYLINK_DEADLINE_DAYS, 'defaultDays' => PAYLINK_DEFAULT_DAYS],
    ]);
}
if ($method !== 'POST') jsonFail('method not allowed', 405);

$body = jsonBody();
$action = (string)($body['action'] ?? '');
$id = (int)($body['id'] ?? 0);
$stamp = date('Y-m-d H:i:s');

// ─── 만들기 ──────────────────────────────────────────────────────
if ($action === 'create') {
    try {
        $clean = paylinkValidateInput($body);
        $link = paylinkMutate(function (array &$store) use ($clean, $adminId, $stamp) {
            $store['seq']++;
            $row = ['id' => $store['seq'], 'token' => bin2hex(random_bytes(16))] + $clean + [
                'status' => 'open', 'orders' => [], 'prepareHits' => [], 'payment' => null, 'refundPolicy' => null,
                'cancels' => [], 'cancelledAmount' => 0, 'smsLog' => [],
                'createdBy' => $adminId, 'createdAt' => $stamp, 'updatedBy' => $adminId, 'updatedAt' => $stamp,
            ];
            $store['links'][] = $row;
            return $row;
        });
    } catch (Throwable $e) { plFail($e, 'create'); }
    logAdminActivity('create', 'paylink', (string)$link['id'], '결제 링크 만들기 — ' . $link['title'] . ' ' . number_format((int)$link['amount']) . '원',
        null, null, plLogDetail($link));
    jsonOut(['ok' => true, 'link' => plDetail($link)]);
}

if ($id <= 0) jsonFail('결제 링크 번호가 필요합니다.');

// ─── 수정 ────────────────────────────────────────────────────────
if ($action === 'update') {
    try {
        $clean = paylinkValidateInput($body);
        [$before, $after] = paylinkWithLinkLock($id, fn() => paylinkMutate(function (array &$store) use ($id, $clean, $adminId, $stamp) {
            $i = paylinkIndex($store, $id);
            if ($i === null) throw new PaylinkError('결제 링크를 찾을 수 없습니다.', 404);
            $x = &$store['links'][$i];
            if ((string)$x['status'] !== 'open') throw new PaylinkError('결제 대기 중인 링크만 수정할 수 있습니다.', 409);
            if (paylinkLiveOrders($x) !== []) throw new PaylinkError('결제가 진행 중이라 지금은 수정할 수 없습니다. 최대 10분 뒤에 다시 시도해주세요.', 409);
            $before = $x;
            foreach ($clean as $k => $v) $x[$k] = $v;
            $x['updatedBy'] = $adminId; $x['updatedAt'] = $stamp;
            return [$before, $x];
        }));
    } catch (Throwable $e) { plFail($e, 'update'); }
    $changed = [];
    $labels = ['title' => '결제명', 'amount' => '금액', 'useDate' => '이용일', 'useInfo' => '이용 시간·장소', 'notice' => '추가 안내',
               'expiresAt' => '결제 기한', 'payerName' => '결제자 이름', 'payerPhone' => '결제자 연락처', 'adminMemo' => '관리자 메모'];
    foreach ($labels as $k => $label) if (($before[$k] ?? null) !== ($after[$k] ?? null)) $changed[] = $label;
    if ($changed) {
        $extra = ['바뀐 항목' => implode(', ', $changed)];
        if (($before['amount'] ?? null) !== ($after['amount'] ?? null)) $extra['금액 변경'] = number_format((int)$before['amount']) . '원 → ' . number_format((int)$after['amount']) . '원';
        logAdminActivity('update', 'paylink', (string)$id, '결제 링크 수정 — ' . $after['title'] . ' (' . implode(', ', $changed) . ')', null, null, plLogDetail($after, $extra));
    }
    jsonOut(['ok' => true, 'link' => plDetail($after)]);
}

// ─── 중지 · 다시 열기 ────────────────────────────────────────────
if ($action === 'stop' || $action === 'reopen') {
    try {
        $after = paylinkWithLinkLock($id, fn() => paylinkMutate(function (array &$store) use ($id, $action, $adminId, $stamp) {
            $i = paylinkIndex($store, $id);
            if ($i === null) throw new PaylinkError('결제 링크를 찾을 수 없습니다.', 404);
            $x = &$store['links'][$i];
            if ($action === 'stop') {
                if ((string)$x['status'] !== 'open') throw new PaylinkError('결제 대기 중인 링크만 중지할 수 있습니다.', 409);
                $x['status'] = 'stopped';
            } else {
                if ((string)$x['status'] !== 'stopped') throw new PaylinkError('중지된 링크만 다시 열 수 있습니다.', 409);
                if (strtotime((string)$x['expiresAt']) <= time()) throw new PaylinkError('결제 기한이 지나 다시 열 수 없습니다. 새 링크를 만들어주세요.', 409);
                $x['status'] = 'open';
            }
            $x['updatedBy'] = $adminId; $x['updatedAt'] = $stamp;
            return $x;
        }));
    } catch (Throwable $e) { plFail($e, $action); }
    logAdminActivity('update', 'paylink', (string)$id, '결제 링크 ' . ($action === 'stop' ? '중지' : '다시 열기') . ' — ' . $after['title'],
        null, null, plLogDetail($after, ['변경' => $action === 'stop' ? '결제 대기 → 중지' : '중지 → 결제 대기']));
    jsonOut(['ok' => true, 'link' => plDetail($after)]);
}

// ─── 결제 요청 문자 ──────────────────────────────────────────────
if ($action === 'send_sms') {
    $l = paylinkFindById($id);
    if ($l === null) jsonFail('결제 링크를 찾을 수 없습니다.', 404);
    if (paylinkState($l) !== 'open') jsonFail('결제 대기 중인 링크만 문자로 보낼 수 있습니다.', 409);
    $phone = (string)($l['payerPhone'] ?? '');
    if ($phone === '') jsonFail('결제자 연락처가 없습니다. [수정]에서 연락처를 넣어주세요.');
    $msg = '[어울림] ' . $l['title'] . " 결제 요청드립니다.\n금액: " . number_format((int)$l['amount']) . "원\n결제 기한: "
        . paylinkShortDateTime((string)$l['expiresAt']) . "\n" . paylinkPayUrl((string)$l['token']);
    $r = paylinkSendSms($phone, $msg, '[어울림] 결제 요청', "request link=$id");
    try {
        paylinkMutate(function (array &$store) use ($id, $r, $adminId, $stamp) {
            $i = paylinkIndex($store, $id);
            if ($i !== null) {
                $log = array_slice(array_values((array)($store['links'][$i]['smsLog'] ?? [])), -19);
                $log[] = ['at' => $stamp, 'adminId' => $adminId, 'ok' => $r['ok']];
                $store['links'][$i]['smsLog'] = $log;
            }
            return null;
        });
    } catch (Throwable $e) { error_log('[admin/paylinks sms log] ' . $e->getMessage()); }
    logAdminActivity('create', 'paylink', (string)$id, '결제 링크 문자 발송 ' . ($r['ok'] ? '성공' : '실패') . ' — ' . $l['title'],
        null, null, plLogDetail($l, ['받는 번호' => paylinkMaskPhone($phone), '결과' => $r['ok'] ? '발송 성공' : $r['error']]));
    if (!$r['ok']) jsonFail($r['error'], 502);
    $fresh = paylinkFindById($id);
    jsonOut(['ok' => true, 'link' => plDetail($fresh ?? $l)]);
}

// ─── 취소 (전액 · 부분) ──────────────────────────────────────────
if ($action === 'cancel') {
    $full = !empty($body['full']);
    $reason = paylinkCleanLine($body['reason'] ?? '', PAYLINK_CANCEL_REASON_MAX);
    if ($reason === '') jsonFail('취소 사유를 입력해주세요.');
    if (mb_strlen($reason) > PAYLINK_CANCEL_REASON_MAX) jsonFail('취소 사유는 ' . PAYLINK_CANCEL_REASON_MAX . '자 이내로 입력해주세요.');
    $cfg = paylinkTossConfig();
    if ($cfg === null) jsonFail('결제 시스템 설정을 읽지 못했습니다.', 500);

    try {
        $res = paylinkWithLinkLock($id, function () use ($id, $full, $body, $reason, $cfg, $adminId) {
            $l = paylinkFindById($id);
            if ($l === null) throw new PaylinkError('결제 링크를 찾을 수 없습니다.', 404);
            if (!in_array((string)$l['status'], ['paid', 'partial_cancelled'], true)) throw new PaylinkError('결제 완료된 링크만 취소할 수 있습니다.', 409);
            $remaining = paylinkRemaining($l);
            if ($remaining <= 0) throw new PaylinkError('남은 결제 금액이 없습니다.', 409);
            if ($full) {
                $amount = $remaining;
            } else {
                $raw = $body['amount'] ?? null;
                if (!(is_int($raw) || (is_string($raw) && preg_match('/^\d{1,9}$/', $raw)))) throw new PaylinkError('취소 금액을 원 단위 숫자로 입력해주세요.');
                $amount = (int)$raw;
                if ($amount < 1 || $amount > $remaining) throw new PaylinkError('취소 금액은 1원 ~ 남은 결제 금액(' . number_format($remaining) . '원)으로 입력해주세요.');
            }
            $paymentKey = (string)($l['payment']['paymentKey'] ?? '');
            if ($paymentKey === '') throw new PaylinkError('결제 키가 없어 취소할 수 없습니다.', 409);
            $quote = paylinkRefundQuote($l);

            $t = paylinkTossCancel($cfg, $paymentKey, $amount, $reason);
            if (!$t['ok']) throw new PaylinkError('토스 결제 취소 실패: ' . $t['message'], 502);
            // 토스에 이미 전액 취소된 결제 — 남은 금액 전부를 취소로 기록 (화면·통계가 실제 상태와 맞게)
            $recorded = $t['already'] ? $remaining : $amount;
            try {
                $after = paylinkMutate(function (array &$store) use ($id, $recorded, $reason, $adminId, $t, $amount) {
                    $i = paylinkIndex($store, $id);
                    if ($i === null) throw new RuntimeException('link missing');
                    $x = &$store['links'][$i];
                    $row = ['at' => date('Y-m-d H:i:s'), 'amount' => $recorded, 'reason' => $reason, 'adminId' => $adminId];
                    if ($t['already']) $row['note'] = '토스에서 이미 취소된 결제 (요청 금액 ' . number_format($amount) . '원)';
                    $x['cancels'] = array_values((array)($x['cancels'] ?? []));
                    $x['cancels'][] = $row;
                    $x['cancelledAmount'] = paylinkCancelledAmount($x) + $recorded;
                    $x['status'] = $x['cancelledAmount'] >= (int)$x['amount'] ? 'cancelled' : 'partial_cancelled';
                    $x['updatedBy'] = $adminId; $x['updatedAt'] = date('Y-m-d H:i:s');
                    return $x;
                });
            } catch (Throwable $e) {
                @file_put_contents(dataDir() . '/_paylink_failure_alert.log', sprintf("[%s] CRITICAL CANCEL_SAVE_FAILED link=%d amount=%d — 토스 취소는 완료, 기록 저장 실패. 수동 기록 필요. %s\n",
                    date('c'), $id, $recorded, $e->getMessage()), FILE_APPEND);
                throw new PaylinkError('토스 결제 취소는 완료됐지만 기록을 저장하지 못했습니다. 개발 담당자에게 알려주세요.', 500);
            }
            return [$after, $recorded, $quote];
        });
    } catch (Throwable $e) { plFail($e, 'cancel'); }

    [$after, $recorded, $quote] = $res;
    $extra = [
        '취소 금액' => number_format($recorded) . '원' . ($full ? ' (전액)' : ' (부분)'),
        '취소 사유' => $reason,
        '누적 취소' => number_format(paylinkCancelledAmount($after)) . '원 / 결제 ' . number_format((int)$after['amount']) . '원',
    ];
    if (is_array($quote)) {
        $extra['오늘 기준 규정'] = '이용일 ' . $quote['days'] . '일 전 · ' . ($quote['rate'] > 0 ? (int)round($quote['rate'] * 100) . '% 환불' : '환불 불가') . ' → ' . number_format((int)$quote['amount']) . '원';
    }
    logAdminActivity('update', 'paylink', (string)$id, '결제 링크 ' . ($after['status'] === 'cancelled' ? '전액' : '부분') . ' 취소 — ' . $after['title'] . ' ' . number_format($recorded) . '원',
        null, null, plLogDetail($after, $extra));
    require_once __DIR__ . '/../paylink/_notify.php';
    respondJsonThen(['ok' => true, 'link' => plDetail($after)], fn() => paylinkNotifyCancel($after, $recorded, $adminId));
}

jsonFail('unknown action');
