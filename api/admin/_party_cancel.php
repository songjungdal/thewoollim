<?php
/**
 * 관리자 [파티 취소] — 신청자 전원 전액 환불 (docs/specs/party-recruit-close-cancel.md 6장).
 *  api/admin/parties.php 의 cancel_preview · cancel_party · cancel_retry · manual_refund_done 이 쓴다.
 *
 * 대상 예약: 이 파티의 예약 중 취소(cancelled)·환불완료(refund_completed)가 아닌 것 — 모임종료(completed)·취소요청(cancel_requested) 포함
 *   - 카드·간편결제 : 남은 결제 금액 전액 토스 취소 (관리자 [100%환불]과 같은 bookingTossCancel) → cancelled
 *   - 무통장 입금 완료(vbankPaidAt 있음): cancelled + manualRefund { amount, status: "pending" } — 관리자가 직접 송금
 *   - 무통장 입금 대기 : cancelled (받은 돈이 없으므로 환불 없음)
 *   공통: cancelReason "party_cancelled", 결제 인원·참가확정 인원·쿠폰 사용 이력은 관리자 [취소]와 같은 bookingReleaseAfterCancel
 * 예약 하나가 실패해도(토스 오류 등) 나머지는 계속 처리한다. 실패한 예약은 상태가 그대로라 [남은 환불 다시 시도]가 다시 처리한다
 * (이미 처리된 예약은 대상에서 빠지므로 건너뜀).
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_booking_cancel.php';
require_once __DIR__ . '/_party_cancel_sms.php';
require_once __DIR__ . '/../notify/_telegram.php';

const PARTY_CANCEL_REASON_MAX = 50;

function partyCancelFindParty(string $partyId): ?array {
    foreach ((array)json_decode((string)@file_get_contents(dataDir() . '/parties.json'), true) as $p) {
        if (is_array($p) && (string)($p['id'] ?? '') === $partyId) return $p;
    }
    return null;
}

/** 파티에 취소 기록 — cancelledAt·cancelledBy·cancelReason (+ 문자 발송 여부 cancelSms, 다시 시도 때 같은 설정을 쓴다) */
function partyCancelMark(string $partyId, string $reason, bool $sendSms, string $adminId): array {
    $saved = null;
    withFileLock(dataDir() . '/parties.json', function (array $parties) use ($partyId, $reason, $sendSms, $adminId, &$saved): array {
        foreach ($parties as &$row) {
            if (!is_array($row) || (string)($row['id'] ?? '') !== $partyId) continue;
            if (partyIsCancelled($row)) throw new RuntimeException('이미 취소된 파티입니다.');
            $row['cancelledAt']  = date('c');
            $row['cancelledBy']  = $adminId;
            $row['cancelReason'] = $reason;
            $row['cancelSms']    = $sendSms;
            $saved = $row;
            return $parties;
        }
        unset($row);
        throw new RuntimeException('party not found');
    });
    return $saved;
}

/** 회원 이메일 → 이름·연락처 (관리자 화면·결과 목록용). 예약 파일 이름(md5)으로 찾기 위해 md5 => email 도 함께 */
function partyCancelUsers(): array {
    $byEmail = []; $byHash = [];
    try {
        $rows = getDB()->query("SELECT email, name, phone FROM users WHERE status IN ('active', 'withdrawn')")->fetchAll();
        foreach ($rows as $u) {
            $e = strtolower(trim((string)$u['email']));
            if ($e === '') continue;
            $byEmail[$e] = ['name' => (string)($u['name'] ?? ''), 'phone' => formatPhone((string)($u['phone'] ?? ''))];
            $byHash[md5($e)] = $e;
        }
    } catch (Throwable $e) {
        error_log('[admin/party-cancel users] ' . $e->getMessage());
    }
    return ['byEmail' => $byEmail, 'byHash' => $byHash];
}

/** 이 파티의 예약 목록 — [ [email, booking], ... ] (회원을 찾을 수 없는 예약 파일은 건너뜀) */
function partyCancelBookings(string $partyId, array $users): array {
    $out = [];
    foreach (glob(dataDir() . '/bookings_*.json') ?: [] as $f) {
        if (!preg_match('/bookings_([0-9a-f]{32})\.json$/', $f, $m)) continue;
        $email = $users['byHash'][$m[1]] ?? null;
        if ($email === null) continue;
        $list = json_decode((string)@file_get_contents($f), true);
        if (!is_array($list)) continue;
        foreach ($list as $b) {
            if (is_array($b) && (string)($b['partyId'] ?? '') === $partyId) $out[] = [$email, $b];
        }
    }
    return $out;
}

/** 파티 취소 대상 분류 — 'card' | 'vbank_paid' | 'vbank_pending', 대상이 아니면 null (취소·환불완료) */
function partyCancelKind(array $b): ?string {
    $st = (string)($b['status'] ?? '');
    if ($st === 'cancelled' || $st === 'refund_completed' || $st === '') return null;
    if ((string)($b['paymentMethod'] ?? '') === 'vbank') return empty($b['vbankPaidAt']) ? 'vbank_pending' : 'vbank_paid';
    return 'card';
}

/** 환불할 금액 — 결제 금액에서 이미 환불한 금액을 뺀 나머지 (무통장 입금 대기는 0) */
function partyCancelAmount(array $b, string $kind): int {
    if ($kind === 'vbank_pending') return 0;
    return max(0, (int)($b['total'] ?? 0) - max(0, (int)($b['refundAmount'] ?? 0)));
}

/** 미리보기 (명세 6-1) — 서버가 계산한 결제 수단별 건수·금액, 남은 처리 목록, 무통장 송금 목록 */
function partyCancelPreview(array $party): array {
    $partyId = (string)$party['id'];
    $users = partyCancelUsers();
    $card = ['count' => 0, 'amount' => 0];
    $vbankPaid = ['count' => 0, 'amount' => 0];
    $vbankPending = ['count' => 0];
    $cancelRequested = ['count' => 0, 'amount' => 0];
    $excluded = ['cancelled' => 0, 'refundCompleted' => 0];
    $remaining = [];
    $manual = [];
    foreach (partyCancelBookings($partyId, $users) as [$email, $b]) {
        $info = $users['byEmail'][$email] ?? ['name' => '', 'phone' => ''];
        $mr = $b['manualRefund'] ?? null;
        if (is_array($mr) && (string)($b['cancelReason'] ?? '') === 'party_cancelled') {
            $manual[] = [
                'email' => $email, 'name' => $info['name'], 'phone' => $info['phone'], 'bookingId' => (string)($b['id'] ?? ''),
                'amount' => (int)($mr['amount'] ?? 0), 'status' => (string)($mr['status'] ?? 'pending') === 'done' ? 'done' : 'pending',
                'doneAt' => (string)($mr['doneAt'] ?? ''), 'doneBy' => (string)($mr['doneBy'] ?? ''),
            ];
        }
        $kind = partyCancelKind($b);
        if ($kind === null) {
            if ((string)($b['status'] ?? '') === 'refund_completed') $excluded['refundCompleted']++;
            else $excluded['cancelled']++;
            continue;
        }
        $amount = partyCancelAmount($b, $kind);
        if ($kind === 'card') { $card['count']++; $card['amount'] += $amount; }
        elseif ($kind === 'vbank_paid') { $vbankPaid['count']++; $vbankPaid['amount'] += $amount; }
        else $vbankPending['count']++;
        if ((string)($b['status'] ?? '') === 'cancel_requested') { $cancelRequested['count']++; $cancelRequested['amount'] += $amount; }
        $remaining[] = [
            'email' => $email, 'name' => $info['name'], 'bookingId' => (string)($b['id'] ?? ''),
            'kind' => $kind, 'amount' => $amount, 'status' => (string)($b['status'] ?? ''),
        ];
    }
    return [
        'party' => [
            'id' => $partyId, 'title' => (string)($party['title'] ?? ''),
            'cancelled' => partyIsCancelled($party), 'cancelledAt' => $party['cancelledAt'] ?? null,
            'cancelReason' => $party['cancelReason'] ?? null, 'cancelSms' => !empty($party['cancelSms']),
        ],
        'card' => $card, 'vbankPaid' => $vbankPaid, 'vbankPending' => $vbankPending,
        'cancelRequested' => $cancelRequested, 'excluded' => $excluded,
        'targets' => count($remaining), 'remaining' => $remaining, 'manualRefunds' => $manual,
    ];
}

/**
 * 대상 예약을 하나씩 처리 (명세 6-2 2~5번). 반환 ['results' => [...], 'summary' => [...]]
 *   results: [ { email, name, bookingId, kind, amount, ok, error } ]
 */
function partyCancelProcess(array $party): array {
    $partyId = (string)$party['id'];
    $reason  = (string)($party['cancelReason'] ?? '주최측 사정');
    $sendSms = !empty($party['cancelSms']);
    $users = partyCancelUsers();
    $results = [];
    $summary = ['card' => 0, 'cardAmount' => 0, 'vbankPaid' => 0, 'vbankPaidAmount' => 0, 'vbankPending' => 0, 'failed' => 0];

    foreach (partyCancelBookings($partyId, $users) as [$email, $snap]) {
        $kind = partyCancelKind($snap);
        if ($kind === null) continue;   // 이미 처리된(취소·환불완료) 예약은 건너뜀
        $bid = (string)($snap['id'] ?? '');
        $name = $users['byEmail'][$email]['name'] ?? '';
        $amount = partyCancelAmount($snap, $kind);
        $row = ['email' => $email, 'name' => $name, 'bookingId' => $bid, 'kind' => $kind, 'amount' => $amount, 'ok' => false, 'error' => ''];

        // 카드 — 토스 전액 취소 (관리자 [100%환불]과 같은 처리). 실패하면 예약은 그대로 두고 다음 예약으로
        if ($kind === 'card' && $amount > 0) {
            $paymentKey = (string)($snap['paymentId'] ?? '');
            if ($paymentKey === '') {
                $row['error'] = '결제 키(paymentId)가 없어 카드 취소를 진행할 수 없습니다.';
                $results[] = $row; $summary['failed']++;
                continue;
            }
            $toss = bookingTossCancel($paymentKey, $amount, '주최측 파티 취소', 'PARTY_CANCEL');
            if (!$toss['ok']) {
                $row['error'] = $toss['error'];
                $results[] = $row; $summary['failed']++;
                @file_put_contents(dataDir() . '/_admin_cancellations.log', sprintf(
                    "[%s] PARTY_CANCEL_FAILED email=%s bid=%s partyId=%s amount=%d error=%s\n",
                    date('c'), $email, $bid, $partyId, $amount, $toss['error']
                ), FILE_APPEND);
                continue;
            }
        }

        // 예약 저장 — 토스 처리 사이에 다른 관리자가 바꿨을 수 있으므로 다시 읽어서 확인
        $list = loadBookings($email);
        $idx = null;
        foreach ($list as $i => $b) {
            if (is_array($b) && (string)($b['id'] ?? '') === $bid) { $idx = $i; break; }
        }
        if ($idx === null || partyCancelKind($list[$idx]) === null) {
            $row['ok'] = true; $row['error'] = '이미 다른 처리로 취소된 예약 — 건너뜀';
            $results[] = $row;
            continue;
        }
        $before = $list[$idx];
        $now = date('c');
        $list[$idx]['status']       = 'cancelled';
        $list[$idx]['updatedAt']    = $now;
        $list[$idx]['cancelledAt']  = $now;
        $list[$idx]['cancelledBy']  = 'admin';
        $list[$idx]['cancelReason'] = 'party_cancelled';
        if ($kind === 'card') $list[$idx]['refundAmount'] = (int)($before['refundAmount'] ?? 0) + $amount;
        if ($kind === 'vbank_paid') $list[$idx]['manualRefund'] = ['amount' => $amount, 'status' => 'pending', 'createdAt' => $now];
        saveBookings($email, $list);

        // 결제 인원·참가확정 인원·회차 인원 -1, 쿠폰 사용 이력 해제 — 관리자 [취소]와 같은 공통 처리
        bookingReleaseAfterCancel($email, $before);

        @file_put_contents(dataDir() . '/_admin_cancellations.log', sprintf(
            "[%s] PARTY_CANCELLED email=%s bid=%s partyId=%s kind=%s amount=%d\n",
            date('c'), $email, $bid, $partyId, $kind, $amount
        ), FILE_APPEND);

        if ($sendSms) notifyPartyCancelSms($email, $party, $kind, $amount, $reason);

        $row['ok'] = true;
        $results[] = $row;
        if ($kind === 'card') { $summary['card']++; $summary['cardAmount'] += $amount; }
        elseif ($kind === 'vbank_paid') { $summary['vbankPaid']++; $summary['vbankPaidAmount'] += $amount; }
        else $summary['vbankPending']++;
    }
    return ['results' => $results, 'summary' => $summary];
}

/** 무통장 환불 [송금 완료] — 성공이면 ['booking' => 갱신된 예약, 'amount' => int], 실패면 오류 문구 */
function partyCancelMarkManualRefundDone(string $partyId, string $email, string $bid, string $adminId) {
    if ($email === '' || $bid === '') return '예약 정보가 필요합니다.';
    $list = loadBookings($email);
    foreach ($list as $i => $b) {
        if (!is_array($b) || (string)($b['id'] ?? '') !== $bid) continue;
        if ((string)($b['partyId'] ?? '') !== $partyId || (string)($b['cancelReason'] ?? '') !== 'party_cancelled' || !is_array($b['manualRefund'] ?? null)) {
            return '파티 취소로 생긴 무통장 환불 예약이 아닙니다.';
        }
        if ((string)($b['manualRefund']['status'] ?? '') === 'done') return '이미 송금 완료로 표시된 예약입니다.';
        $list[$i]['manualRefund']['status'] = 'done';
        $list[$i]['manualRefund']['doneAt'] = date('c');
        $list[$i]['manualRefund']['doneBy'] = $adminId;
        $list[$i]['updatedAt'] = date('c');
        saveBookings($email, $list);
        return ['booking' => $list[$i], 'amount' => (int)($b['manualRefund']['amount'] ?? 0)];
    }
    return '예약을 찾을 수 없습니다.';
}

/** 텔레그램 (명세 6-2 6번) — 설정이 켜져 있을 때만(telegramSend 가 판단). 회원 이름·연락처는 넣지 않는다 */
function partyCancelNotifyTelegram(array $party, array $result, string $adminId, bool $retry): void {
    try {
        $s = $result['summary'];
        telegramSend(implode("\n", [
            '[어울림] 파티 취소' . ($retry ? '(남은 환불 다시 시도)' : '') . ' · ' . (string)($party['title'] ?? ''),
            '· 카드 환불 ' . $s['card'] . '건 / 무통장 송금 필요 ' . $s['vbankPaid'] . '건 / 실패 ' . $s['failed'] . '건',
            '· 처리: ' . $adminId,
        ]));
    } catch (Throwable $e) {
        error_log('[admin/party-cancel telegram] ' . $e->getMessage());
    }
}

/** 활동 로그 상세 — 결과 건수와 예약별 결과(예약 번호·결제 수단·금액·성공 여부) */
function partyCancelLogDetail(array $result): array {
    $s = $result['summary'];
    $kindLabel = ['card' => '카드', 'vbank_paid' => '무통장(입금 완료)', 'vbank_pending' => '무통장(입금 대기)'];
    $lines = [];
    foreach ($result['results'] as $r) {
        $lines[] = '#' . $r['bookingId'] . ' ' . ($kindLabel[$r['kind']] ?? $r['kind']) . ' ' . number_format((int)$r['amount']) . '원 '
            . ($r['ok'] ? '처리됨' : '실패(' . $r['error'] . ')');
    }
    return [
        '카드 환불' => $s['card'] . '건 · ' . number_format($s['cardAmount']) . '원',
        '무통장 송금 필요' => $s['vbankPaid'] . '건 · ' . number_format($s['vbankPaidAmount']) . '원',
        '무통장 입금 대기 취소' => $s['vbankPending'] . '건',
        '실패' => $s['failed'] . '건',
        '예약별 결과' => $lines ? implode("\n", $lines) : '처리할 예약 없음',
    ];
}
