<?php
/**
 * 카드 등록(빌링 인증) 성공 뒤 처리 — /membership/success/ 화면이 호출한다.
 *
 * POST { customerKey, authKey }
 *   → { ok: true, membership }                     첫 결제까지 끝남(또는 이미 이용 중)
 *   → { ok: false, code, message, retryable? }    실패 — 화면은 /membership/fail/ 로 보낸다
 *
 * 처리 순서 (저장 파일 잠금 안에서 한 번에 — 동시 요청은 줄을 서서 처리된다)
 *  1) customerKey 가 로그인 회원의 값과 같은지 확인. 다르면 403.
 *  2) 이미 이용 중이면 발급·결제 없이 현재 상태만 돌려준다 (새로고침·중복 호출).
 *  3) 같은 authKey 로 이미 실패 처리된 요청이면 그 결과만 돌려준다.
 *  4) 결제 결과를 모른 채 남은 대기 건이 있으면 같은 주문번호로 토스에 조회 → 승인돼 있으면 반영, 없으면 같은 주문번호로 다시 결제.
 *  5) 그 밖에는 빌링키 발급 → 대기 상태를 먼저 저장 → 99,000원 결제.
 *     결제 실패가 확정되면 빌링키 삭제 API 를 호출하고 멤버십을 종료(canceled)한다.
 *  - 결제 요청은 주문번호를 Idempotency-Key 로 함께 보낸다(토스 쪽 중복 승인 방지).
 *  - 빌링키는 암호화해 저장하고, 응답·로그에 남기지 않는다.
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();
@set_time_limit(120);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);
requireUser();

$cfg = membershipConfig();
if (!$cfg['ready']) jsonOut(['ok' => false, 'code' => 'NOT_READY', 'message' => '멤버십 결제를 준비하고 있습니다. 잠시 후 다시 시도해주세요.'], 503);

$body        = jsonBody();
$customerKey = trim((string)($body['customerKey'] ?? ''));
$authKey     = trim((string)($body['authKey'] ?? ''));
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $customerKey)
    || $authKey === '' || strlen($authKey) > 300) {
    jsonOut(['ok' => false, 'code' => 'INVALID_REQUEST', 'message' => '카드 등록 정보가 올바르지 않습니다. 다시 시도해주세요.'], 400);
}

$userId   = (int)currentUserId();
$email    = (string)currentUserEmail();
$authHash = hash('sha256', $authKey);
$result   = [500, ['ok' => false, 'code' => 'UNKNOWN_ERROR', 'message' => '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.']];

/** 토스 오류 응답 → [code, message] */
function membershipTossError(array $r): array {
    $code = (string)($r['json']['code'] ?? ($r['http'] === 0 ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR'));
    $msg  = (string)($r['json']['message'] ?? '결제사 응답을 받지 못했습니다.');
    return [$code, $msg];
}

try {
    membershipWithStore($cfg, function (array $store, callable $save) use ($cfg, $userId, $email, $customerKey, $authKey, $authHash, &$result): ?array {
        // 1) customerKey 검증
        $ck = (string)($store['customers'][(string)$userId] ?? '');
        if ($ck === '' || !hash_equals($ck, $customerKey)) {
            membershipLog("reject customerKey mismatch userId={$userId}");
            $result = [403, ['ok' => false, 'code' => 'CUSTOMER_KEY_MISMATCH', 'message' => '로그인한 회원의 카드 등록 정보가 아닙니다. 다시 시도해주세요.']];
            return null;
        }

        $idx = membershipLatestIndex($store, $userId);
        $cur = $idx !== null ? $store['memberships'][$idx] : null;

        // 2) 이미 이용 중
        if ($cur !== null && membershipIsCurrent($cur)) {
            $result = [200, ['ok' => true, 'membership' => membershipView($cur, $store['payments'])]];
            return null;
        }

        // 3) 같은 authKey 로 이미 끝난 요청
        foreach ($store['memberships'] as $x) {
            if ((int)($x['user_id'] ?? 0) === $userId && ($x['auth_key_hash'] ?? '') === $authHash && ($x['status'] ?? '') !== 'pending') {
                $result = [200, ['ok' => false,
                    'code'    => (string)($x['fail_code'] ?? 'ALREADY_PROCESSED'),
                    'message' => (string)($x['fail_message'] ?? '이미 처리된 카드 등록입니다. 다시 시도해주세요.')]];
                return null;
            }
        }

        $reconcile = $cur !== null && ($cur['status'] ?? '') === 'pending' && !empty($cur['billing_key']);
        if ($reconcile) {
            // 4) 대기 건 마무리 — 새 빌링키는 발급하지 않는다
            $mIdx = $idx;
        } else {
            // 5) 새로 발급
            if ($cur !== null && ($cur['status'] ?? '') === 'active') {
                $store['memberships'][$idx]['status']     = 'expired';   // 기간이 끝난 이전 멤버십
                $store['memberships'][$idx]['updated_at'] = date('c');
            }
            $r = membershipToss('POST', '/v1/billing/authorizations/issue',
                ['authKey' => $authKey, 'customerKey' => $customerKey], $cfg['secretKey'], 'issue-' . $authHash);
            $billingKey = (string)($r['json']['billingKey'] ?? '');
            if ($r['http'] !== 200 || $billingKey === '') {
                [$code, $msg] = membershipTossError($r);
                membershipLog("issue fail userId={$userId} http={$r['http']} code={$code}");
                $result = [200, ['ok' => false, 'code' => $code, 'message' => $msg]];
                return $store;
            }
            $id = 'ms_' . bin2hex(random_bytes(8));
            $store['memberships'][] = [
                'id'                   => $id,
                'user_id'              => $userId,
                'status'               => 'pending',
                'price'                => MEMBERSHIP_PRICE,
                'customer_key'         => $customerKey,
                'billing_key'          => membershipEncrypt($billingKey, $cfg['encKey']),
                'card_company'         => isset($r['json']['cardCompany']) ? (string)$r['json']['cardCompany'] : null,
                'card_last4'           => membershipCardLast4($r['json']['cardNumber'] ?? ($r['json']['card']['number'] ?? null)),
                'current_period_start' => null,
                'current_period_end'   => null,
                'next_billing_at'      => null,
                'cancel_at_period_end' => false,
                'canceled_at'          => null,
                'is_test'              => $cfg['mode'] === 'test',
                'created_at'           => date('c'),
                'updated_at'           => date('c'),
                'auth_key_hash'        => $authHash,
                'pending_order_id'     => 'WLM-' . $id . '-1',
                'fail_code'            => null,
                'fail_message'         => null,
            ];
            $mIdx = array_key_last($store['memberships']);
            $save($store);   // 결제 요청 전에 대기 상태부터 남긴다 (요청이 끊겨도 4) 에서 이어서 처리)
            membershipLog("billing key issued membership={$id} userId={$userId}");
        }

        $m          = $store['memberships'][$mIdx];
        $orderId    = (string)$m['pending_order_id'];
        $billingKey = membershipDecrypt((string)$m['billing_key'], $cfg['encKey']);
        if ($billingKey === null) {
            membershipLog("billing key decrypt fail membership={$m['id']}");
            $result = [500, ['ok' => false, 'code' => 'BILLING_KEY_UNREADABLE', 'message' => '카드 정보를 확인하지 못했습니다. 고객센터로 문의해주세요.']];
            return $store;
        }

        $pay = null;
        if ($reconcile) {
            $q = membershipToss('GET', '/v1/payments/orders/' . rawurlencode($orderId), null, $cfg['secretKey']);
            if ($q['http'] === 200 && ($q['json']['status'] ?? '') === 'DONE') {
                $pay = $q['json'];
            } elseif ($q['http'] === 0 || $q['http'] >= 500) {
                $result = [200, ['ok' => false, 'retryable' => true, 'code' => 'PAYMENT_UNCONFIRMED', 'message' => '결제 결과를 확인하지 못했습니다. 잠시 후 이 화면을 새로고침해주세요.']];
                return $store;
            }
        }

        if ($pay === null) {
            $req = [
                'customerKey'   => $customerKey,
                'amount'        => MEMBERSHIP_PRICE,
                'orderId'       => $orderId,
                'orderName'     => MEMBERSHIP_ORDER_NAME,
                'customerEmail' => $email,
            ];
            $name = membershipUserName($email);
            if ($name !== '') $req['customerName'] = $name;

            $p = membershipToss('POST', '/v1/billing/' . rawurlencode($billingKey), $req, $cfg['secretKey'], $orderId);
            if ($p['http'] === 200 && ($p['json']['status'] ?? '') === 'DONE') {
                $pay = $p['json'];
            } elseif ($p['http'] === 0 || $p['http'] >= 500) {
                // 결과를 모름 — 대기 상태로 두고, 다시 들어오면 4) 에서 조회부터 한다
                membershipLog("charge unconfirmed membership={$m['id']} order={$orderId} http={$p['http']}");
                $result = [200, ['ok' => false, 'retryable' => true, 'code' => 'PAYMENT_UNCONFIRMED', 'message' => '결제 결과를 확인하지 못했습니다. 잠시 후 이 화면을 새로고침해주세요.']];
                return $store;
            } else {
                // 결제 실패 확정 → 실패 기록, 빌링키 삭제, 멤버십 종료
                [$code, $msg] = membershipTossError($p);
                $store['payments'][] = [
                    'id'            => 'mp_' . bin2hex(random_bytes(8)),
                    'membership_id' => $m['id'],
                    'cycle_no'      => 1,
                    'order_id'      => $orderId,
                    'payment_key'   => null,
                    'amount'        => MEMBERSHIP_PRICE,
                    'status'        => 'failed',
                    'fail_code'     => $code,
                    'fail_message'  => $msg,
                    'approved_at'   => null,
                    'raw_response'  => membershipScrub($p['json'] ?? []),
                    'is_test'       => !empty($m['is_test']),
                    'created_at'    => date('c'),
                ];
                $d = membershipToss('DELETE', '/v1/billing/' . rawurlencode($billingKey), null, $cfg['secretKey']);
                $store['memberships'][$mIdx] = array_merge($m, [
                    'status'              => 'canceled',
                    'billing_key'         => null,
                    'billing_key_deleted' => $d['http'] === 200,
                    'canceled_at'         => date('c'),
                    'pending_order_id'    => null,
                    'fail_code'           => $code,
                    'fail_message'        => $msg,
                    'updated_at'          => date('c'),
                ]);
                membershipLog("charge fail membership={$m['id']} order={$orderId} code={$code} billingKeyDelete={$d['http']}");
                $result = [200, ['ok' => false, 'code' => $code, 'message' => $msg]];
                return $store;
            }
        }

        // 승인 완료 → 이용 시작
        if ((int)($pay['totalAmount'] ?? 0) !== MEMBERSHIP_PRICE) {
            membershipLog("amount mismatch membership={$m['id']} order={$orderId} total=" . (int)($pay['totalAmount'] ?? 0));
        }
        $start  = membershipToday();
        $anchor = (int)substr($start, 8, 2);
        $next   = membershipNextMonth($start, $anchor);
        $store['memberships'][$mIdx] = array_merge($m, [
            'status'               => 'active',
            'current_period_start' => $start,
            'current_period_end'   => membershipDayBefore($next),
            'next_billing_at'      => $next,
            'billing_anchor_day'   => $anchor,
            'pending_order_id'     => null,
            'card_company'         => $m['card_company'] ?? (isset($pay['card']['issuerCode']) ? (string)$pay['card']['issuerCode'] : null),
            'card_last4'           => $m['card_last4'] ?? membershipCardLast4($pay['card']['number'] ?? null),
            'updated_at'           => date('c'),
        ]);
        $already = false;
        foreach ($store['payments'] as $p) if (($p['order_id'] ?? '') === $orderId && ($p['status'] ?? '') === 'success') $already = true;
        if (!$already) {
            $store['payments'][] = [
                'id'            => 'mp_' . bin2hex(random_bytes(8)),
                'membership_id' => $m['id'],
                'cycle_no'      => 1,
                'order_id'      => $orderId,
                'payment_key'   => (string)($pay['paymentKey'] ?? ''),
                'amount'        => (int)($pay['totalAmount'] ?? MEMBERSHIP_PRICE),
                'status'        => 'success',
                'fail_code'     => null,
                'fail_message'  => null,
                'approved_at'   => $pay['approvedAt'] ?? date('c'),
                'raw_response'  => membershipScrub($pay),
                'is_test'       => !empty($m['is_test']),
                'created_at'    => date('c'),
            ];
        }
        membershipLog("activated membership={$m['id']} userId={$userId} order={$orderId}");
        $result = [200, ['ok' => true, 'membership' => membershipView($store['memberships'][$mIdx], $store['payments'])]];
        return $store;
    });
} catch (Throwable $e) {
    membershipLog('confirm error: ' . $e->getMessage());
}

jsonOut($result[1], $result[0]);
