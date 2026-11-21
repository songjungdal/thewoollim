<?php
/**
 * 예약 취소·환불 공통 처리 — 관리자 예약 처리(api/admin/bookings.php)와 파티 취소(api/admin/parties.php cancel_party)가 같은 코드를 쓴다.
 *  - 예약 파일 읽기·쓰기 (loadBookings / saveBookings)
 *  - 토스 결제 취소 (bookingTossCancel) — ALREADY_CANCELED 는 성공으로 본다
 *  - 취소 뒤 정리 (bookingReleaseAfterCancel) — 결제 인원 -1(무통장 미입금 제외)·참가확정 인원 -1·쿠폰 사용 이력 해제
 * docs/specs/party-recruit-close-cancel.md 6-2 ("기존 처리와 같은 코드를 쓴다")
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';

if (!function_exists('loadBookings')) {

    function loadBookings(string $email): array {
        $f = dataDir() . '/bookings_' . md5(strtolower(trim($email))) . '.json';
        if (!file_exists($f)) return [];
        $d = json_decode((string)file_get_contents($f), true);
        return is_array($d) ? $d : [];
    }

    function saveBookings(string $email, array $bookings): void {
        file_put_contents(
            dataDir() . '/bookings_' . md5(strtolower(trim($email))) . '.json',
            json_encode($bookings, JSON_UNESCAPED_UNICODE)
        );
    }

    /**
     * 취소한 예약이 차지하던 참가확정 자리를 돌려준다 — 참가확정 인원 -1 (참가 구성 예약은 저장된 회차마다).
     * 예약을 'cancelled' 로 저장한 뒤 부른다. 인원 파일을 다시 센 경우엔 이 예약이 이미 빠져 있으므로 증감하지 않는다.
     * 반환: 자리를 차지하던 예약이었는지 (활동 로그용). 기록 실패는 취소 처리를 막지 않는다.
     */
    function releaseConfirmedSeat(array $before): bool {
        $partyId = (string)($before['partyId'] ?? '');
        if ($partyId === '' || !bookingHoldsSeat($before)) return false;
        $genderKey = (string)($before['gender'] ?? '') === '남성' ? 'male' : 'female';
        $sids = array_map('strval', (array)($before['sessionIds'] ?? []));
        try {
            withConfirmedCounts(function (array &$c, bool $rebuilt) use ($partyId, $genderKey, $sids): bool {
                if ($rebuilt) return false;
                countsAdjust($c, $partyId, $genderKey, $sids, -1);
                return true;
            });
        } catch (Throwable $e) {
            error_log('[admin/bookings confirmed seat release] ' . $e->getMessage());
        }
        return true;
    }

    /**
     * 토스 결제 취소 (서버-서버). 반환 ['ok' => bool, 'error' => string(회원·관리자에게 보여줄 문구)]
     *  - 이미 취소된 결제(ALREADY_CANCELED_PAYMENT)는 성공으로 본다
     *  - 요청·응답은 _toss_refund.log 에 남긴다 ($logTag: APPROVE_REFUND / CANCEL_FULL_REFUND / PARTY_CANCEL)
     */
    function bookingTossCancel(string $paymentKey, int $amount, string $cancelReason, string $logTag): array {
        try {
            $cfg = require __DIR__ . '/../payments/toss-config.php';
            $ch  = curl_init('https://api.tosspayments.com/v1/payments/' . urlencode($paymentKey) . '/cancel');
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => json_encode(['cancelReason' => $cancelReason, 'cancelAmount' => $amount]),
                CURLOPT_HTTPHEADER     => [
                    'Authorization: Basic ' . base64_encode($cfg['secret_key'] . ':'),
                    'Content-Type: application/json',
                ],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 20,
            ]);
            $tossBody = curl_exec($ch);
            $tossHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $tossJson = is_string($tossBody) ? (json_decode($tossBody, true) ?: []) : [];
            curl_close($ch);
            @file_put_contents(dataDir() . '/_toss_refund.log', sprintf(
                "[%s] %s paymentKey=%s amount=%d http=%d body=%s\n",
                date('c'), $logTag, $paymentKey, $amount, $tossHttp, substr((string)$tossBody, 0, 400)
            ), FILE_APPEND);
            // 이미 취소된 결제(ALREADY_CANCELED)는 성공으로 간주
            $alreadyCanceled = ($tossHttp === 400 && (string)($tossJson['code'] ?? '') === 'ALREADY_CANCELED_PAYMENT');
            if ($tossHttp !== 200 && !$alreadyCanceled) {
                return ['ok' => false, 'error' => 'Toss 결제 취소 실패: ' . (string)($tossJson['message'] ?? "HTTP $tossHttp")];
            }
            return ['ok' => true, 'error' => ''];
        } catch (Throwable $e) {
            error_log('[' . strtolower($logTag) . ' toss] ' . $e->getMessage());
            return ['ok' => false, 'error' => '결제 취소 처리 중 오류가 발생했습니다.'];
        }
    }

    /**
     * 예약을 'cancelled' 로 저장한 뒤의 정리 — 관리자 [취소]·[100%환불]·파티 취소 공통.
     *  1) 결제 인원(party_counts) -1 (atomic). 무통장 미입금 건은 애초에 +1 되지 않았으므로 건너뜀 (v7.0)
     *     — 참가 구성 예약은 예약에 저장된 회차 인원도 각각 -1
     *  2) 참가확정 인원 -1 — 참가확정 자리를 차지하던 예약만 (releaseConfirmedSeat)
     *  3) 사용했던 쿠폰 사용 이력 해제 — 재사용 가능하도록 복원
     * 반환: ['partyId','gender','genderKey','wasCounted','heldSeat'] (활동 로그용)
     */
    function bookingReleaseAfterCancel(string $email, array $before): array {
        $partyId   = (string)($before['partyId'] ?? '');
        $gender    = (string)($before['gender']  ?? '');
        $genderKey = $gender === '남성' ? 'male' : 'female';

        // ⚠ 무통장 미입금 건은 애초에 인원 카운트(+1)가 안 된 상태이므로 -1 차감에서 제외 (v7.0).
        //   카운트 시점: 카드=success.php 즉시 / 무통장=관리자 [결제확인](confirm_vbank, vbankPaidAt 기록).
        //   따라서 'vbank 인데 vbankPaidAt 이 없으면' 한 번도 카운트 안 된 건 → 차감 스킵.
        $wasCounted = !(($before['paymentMethod'] ?? '') === 'vbank' && empty($before['vbankPaidAt']));
        if ($partyId !== '' && $wasCounted) {
            $countsFile = dataDir() . '/party_counts.json';
            $fp = fopen($countsFile, 'c+');
            if ($fp) {
                flock($fp, LOCK_EX);
                $raw = stream_get_contents($fp);
                $counts = $raw ? json_decode($raw, true) : [];
                if (!is_array($counts)) $counts = [];
                // 파티 신청 인원 -1, 참가 구성 예약이면 예약에 저장된 회차 인원도 각각 -1
                countsAdjust($counts, $partyId, $genderKey, array_map('strval', (array)($before['sessionIds'] ?? [])), -1);
                ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($counts));
                fflush($fp); flock($fp, LOCK_UN); fclose($fp);
            }
        }
        // 참가확정 인원 -1 — 참가확정 자리를 차지하던 예약만
        $heldSeat = releaseConfirmedSeat($before);

        // 사용했던 쿠폰이 있으면 사용 이력 해제 — 재사용 가능하도록 복원
        releaseCouponUsage((string)($before['couponCode'] ?? ''), $email);

        return ['partyId' => $partyId, 'gender' => $gender, 'genderKey' => $genderKey, 'wasCounted' => $wasCounted, 'heldSeat' => $heldSeat];
    }
}
