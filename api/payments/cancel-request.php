<?php
/**
 * 취소 요청 접수 (승인제). v7.0
 *
 * POST { email, bookingId } → { ok:true }
 *
 * 기존 refund.php(즉시 Toss 취소 + 인원 -1)와 달리, 여기서는 **결제 취소를 하지 않고**
 * 예약 상태만 'cancel_requested'(취소 요청 중)로 전환한다.
 *  - Toss 결제 취소 API 미호출
 *  - party_counts 미변경 (인원 차감은 관리자가 별도 [취소]로 처리하는 기존 흐름 유지)
 * 실제 환불/취소는 관리자 [취소요청] 탭의 [취소승인처리]에서 수행.
 *
 * 환불 금액은 **요청한 날 기준으로 고정**한다 — 관리자 승인이 늦어져도 줄지 않게.
 *  - refundQuote()(lib.php) 로 계산해 refundRequestDays / refundRequestRate / refundRequestAmount 로 저장,
 *    관리자 approve_refund 가 이 금액으로 환불한다.
 *  - 환불 불가(파티 2일 전~당일, 지난 파티)면 접수하지 않는다 — 마이페이지 화면의 차단과 같은 규칙.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

requireUser();
$body  = jsonBody();
$email = (string)($body['email']     ?? '');
$bid   = (string)($body['bookingId'] ?? '');

// 세션 이메일과 요청 이메일 일치 검증 (타인 예약 조작 차단)
requireUser($email);

if ($bid === '') jsonFail('예약 정보가 없습니다.');

$dataDir = __DIR__ . '/../data';
$bf = $dataDir . '/bookings_' . md5(strtolower(trim($email))) . '.json';
if (!file_exists($bf)) jsonFail('예약을 찾을 수 없습니다.', 404);

$bookings = json_decode((string)file_get_contents($bf), true);
if (!is_array($bookings)) $bookings = [];

$found = false;
$quote = null;
foreach ($bookings as &$b) {
    if (!is_array($b)) continue;
    if ((string)($b['id'] ?? '') === $bid) {
        $st = (string)($b['status'] ?? '');
        if (in_array($st, ['cancelled', 'cancel_requested', 'refund_completed'], true)) {
            jsonFail('이미 취소 요청되었거나 처리된 예약입니다.', 409);
        }
        // 요청한 날 기준 환불 금액 — 파티 날짜를 모르면 저장하지 않고(승인 시 다시 계산) 접수만 한다
        $quote = refundQuote((int)($b['total'] ?? 0), partyCalendarDate((string)($b['partyId'] ?? '')));
        if ($quote !== null && $quote['rate'] <= 0) {
            jsonFail('파티 시작 2일 전부터는 환불 및 취소가 불가능합니다. 자세한 사항은 고객센터로 문의 바랍니다.', 409);
        }
        $b['status']            = 'cancel_requested';
        $b['updatedAt']         = date('c');
        $b['cancelRequestedAt'] = date('c');
        if ($quote !== null) {
            $b['refundRequestDays']   = $quote['days'];
            $b['refundRequestRate']   = $quote['rate'];
            $b['refundRequestAmount'] = $quote['amount'];
        }
        $found = true;
        break;
    }
}
unset($b);
if (!$found) jsonFail('예약을 찾을 수 없습니다.', 404);

file_put_contents($bf, json_encode($bookings, JSON_UNESCAPED_UNICODE));

@file_put_contents("$dataDir/_cancel_requests.log", sprintf(
    "[%s] CANCEL_REQUEST email=%s bid=%s refund=%s\n", date('c'), $email, $bid,
    $quote !== null ? (string)$quote['amount'] : '-'
), FILE_APPEND);

jsonOut([
    'ok'           => true,
    'refundAmount' => $quote['amount'] ?? null,
    'refundRate'   => $quote['rate'] ?? null,
]);
