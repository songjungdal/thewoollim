<?php
/**
 * 회원 본인 예약 취소 + 환불.
 *
 * POST { email, bookingId } → { ok: true, refundAmount: <int> }
 *
 * 처리:
 *  1) 본인 예약인지 확인
 *  2) 환불 정책 적용 (app/lib/refund.ts 와 동일 규정 — 파티 5일 전 100%, 그 후 0%)
 *  3) status='cancelled', cancelledAt, cancelledBy='user'
 *  4) party_counts atomic -1
 *  5) Toss 환불 API 호출 (선택 — 운영 키일 때만 동작; 테스트 키는 confirm 만 가능, refund 는 별도 권한 필요)
 *
 * 본인만 — email 이 세션과 일치.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body  = jsonBody();
$email = normalizeEmail((string)($body['email']     ?? ''));
$bid   = trim((string)         ($body['bookingId'] ?? ''));
requireUser($email);

if ($bid === '') jsonFail('취소할 예약이 지정되지 않았습니다.');

$dataDir = __DIR__ . '/../data';
$bf      = $dataDir . '/bookings_' . md5($email) . '.json';
if (!file_exists($bf)) jsonFail('예약 정보를 찾을 수 없습니다.', 404);

$bookings = json_decode((string)file_get_contents($bf), true);
if (!is_array($bookings)) jsonFail('예약 데이터 손상', 500);

// 파티 정보
$parties = json_decode((string)@file_get_contents($dataDir . '/parties.json'), true);
$partyMap = [];
foreach ((array)$parties as $p) if (isset($p['id'])) $partyMap[(string)$p['id']] = $p;

$found = null; $idx = -1;
foreach ($bookings as $i => $b) {
    if (($b['id'] ?? '') === $bid) { $found = $b; $idx = $i; break; }
}
if ($found === null) jsonFail('예약을 찾을 수 없습니다.', 404);
if (($found['status'] ?? '') === 'cancelled') jsonFail('이미 취소된 예약입니다.', 410);

$partyId = (string)($found['partyId'] ?? '');
$party   = $partyMap[$partyId] ?? null;

// 환불 금액 계산 — 파티 5일 전까지 100% / 그 후 0%
$paidAmount = (int)($found['total'] ?? ($party['price'] ?? 0));
$refundAmount = 0;
if ($party && !empty($party['calendarDate'])) {
    $partyTs = strtotime((string)$party['calendarDate']);
    $now     = time();
    $daysToParty = floor(($partyTs - $now) / 86400);
    if ($daysToParty >= 5) $refundAmount = $paidAmount;
}

// booking 업데이트
$bookings[$idx]['status']      = 'cancelled';
$bookings[$idx]['updatedAt']   = date('c');
$bookings[$idx]['cancelledAt'] = date('c');
$bookings[$idx]['cancelledBy'] = 'user';
$bookings[$idx]['refundAmount']= $refundAmount;
file_put_contents($bf, json_encode($bookings, JSON_UNESCAPED_UNICODE));

// party_counts -1 (atomic)
$gender    = (string)($found['gender'] ?? '');
$genderKey = $gender === '남성' ? 'male' : 'female';
if ($partyId !== '') {
    $cf = "$dataDir/party_counts.json";
    $fp = fopen($cf, 'c+');
    if ($fp) {
        flock($fp, LOCK_EX);
        $raw = stream_get_contents($fp);
        $counts = $raw ? json_decode($raw, true) : [];
        if (!is_array($counts)) $counts = [];
        if (!isset($counts[$partyId]) || !is_array($counts[$partyId])) {
            $counts[$partyId] = ['male' => 0, 'female' => 0];
        }
        $counts[$partyId][$genderKey] = max(0, (int)($counts[$partyId][$genderKey] ?? 0) - 1);
        ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($counts));
        fflush($fp); flock($fp, LOCK_UN); fclose($fp);
    }
}

// Toss 환불 API (best-effort — 실패해도 booking 취소는 유지)
$paymentKey = (string)($found['paymentId']  ?? '');
$cancelOk   = false;
if ($paymentKey !== '' && $refundAmount > 0) {
    try {
        $cfg = require __DIR__ . '/toss-config.php';
        $ch  = curl_init('https://api.tosspayments.com/v1/payments/' . urlencode($paymentKey) . '/cancel');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode([
                'cancelReason' => '회원 요청에 의한 취소',
                'cancelAmount' => $refundAmount,
            ]),
            CURLOPT_HTTPHEADER     => [
                'Authorization: Basic ' . base64_encode($cfg['secret_key'] . ':'),
                'Content-Type: application/json',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
        ]);
        $tossBody = curl_exec($ch);
        $tossHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $cancelOk = ($tossHttp === 200);
        @file_put_contents($dataDir . '/_toss_refund.log', sprintf(
            "[%s] paymentKey=%s amount=%d http=%d body=%s\n",
            date('c'), $paymentKey, $refundAmount, $tossHttp, substr((string)$tossBody, 0, 400)
        ), FILE_APPEND);
    } catch (Throwable $e) {
        error_log('[refund toss] ' . $e->getMessage());
    }
}

@file_put_contents($dataDir . '/_user_cancellations.log', sprintf(
    "[%s] CANCELLED email=%s bid=%s partyId=%s refund=%d tossOk=%s\n",
    date('c'), $email, $bid, $partyId, $refundAmount, $cancelOk ? 'Y' : 'N'
), FILE_APPEND);

jsonOut([
    'ok'           => true,
    'refundAmount' => $refundAmount,
    'tossCancelled'=> $cancelOk,
]);
