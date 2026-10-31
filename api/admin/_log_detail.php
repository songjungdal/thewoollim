<?php
/**
 * 관리자 활동 로그의 상세 정보(detail) 만들기 — 파티 삭제, 예약 취소·100% 환불 취소, 취소요청 승인(환불).
 *  - 호출 위치: api/admin/parties.php (delete), api/admin/bookings.php (cancel / cancel_full_refund / approve_refund)
 *    → 처리가 끝난 뒤 logAdminActivity() 의 $detail 로 넘긴다. 로그 관리 탭 [상세 보기]에 "항목: 값" 표로 보인다.
 *  - 기록용으로 읽기만 한다. 삭제·취소·환불·인원·쿠폰·문자 처리에는 관여하지 않는다.
 *  - 절대 throw 하지 않음: 실패한 항목은 빼고 만들 수 있는 항목만 돌려준다 (로그 때문에 처리 응답이 실패하면 안 됨).
 *  - 개인정보는 회원 이름·이메일만 남긴다 (연락처·생년월일은 넣지 않는다).
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';

if (!function_exists('adminLogPartyDetail')) {

    /** 예약 상태 한글 이름 — 관리자 화면 STATUS_LABEL(app/admin8888/dashboard/page.tsx)과 같은 이름 */
    function _adminLogStatusLabel(string $status): string {
        $labels = [
            'vbank_pending'        => '입금 확인 중',
            'paid_pending_profile' => '결제완료(프로필 대기)',
            'pending_approval'     => '확정 대기 중',
            'confirmed'            => '참가 확정 완료',
            'completed'            => '모임종료',
            'cancel_requested'     => '취소요청',
            'refund_completed'     => '환불 완료',
            'cancelled'            => '취소됨',
        ];
        return $labels[$status] ?? ($status === '' ? '-' : $status);
    }

    function _adminLogWon(int $n): string {
        return number_format($n) . '원';
    }

    /** ISO 문자열·유닉스 시각 → 'YYYY-MM-DD HH:MM' (KST). 읽을 수 없으면 '' */
    function _adminLogTime($v): string {
        if (is_int($v) || (is_string($v) && ctype_digit($v))) {
            $ts = (int)$v;
        } else {
            $ts = strtotime((string)$v);
        }
        return $ts ? date('Y-m-d H:i', $ts) : '';
    }

    function _adminLogFindParty(string $partyId): ?array {
        if ($partyId === '') return null;
        $parties = json_decode((string)@file_get_contents(dataDir() . '/parties.json'), true);
        foreach ((array)$parties as $p) {
            if (is_array($p) && (string)($p['id'] ?? '') === $partyId) return $p;
        }
        return null;
    }

    function _adminLogUserName(string $email): string {
        if ($email === '') return '';
        try {
            require_once __DIR__ . '/../db.php';
            $stmt = getDB()->prepare('SELECT name FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1');
            $stmt->execute([$email]);
            return trim((string)($stmt->fetchColumn() ?: ''));
        } catch (Throwable $e) {
            error_log('[admin/_log_detail user] ' . $e->getMessage());
            return '';
        }
    }

    /** "#12 파티명" — 파티를 못 찾으면 "#12 (파티 정보 없음)" */
    function _adminLogPartyName(string $partyId, ?array $party): string {
        $title = $party !== null ? trim((string)($party['title'] ?? '')) : '';
        return '#' . $partyId . ' ' . ($title !== '' ? $title : '(파티 정보 없음)');
    }

    /** 참가비 — 참가 항목이 있으면 항목별 남/여 가격, 아니면 성별 가격(없으면 기본 가격). 할인율은 따로 적는다 */
    function _adminLogPartyPrice(array $party): string {
        if (partyHasOptions($party)) {
            $parts = [];
            foreach ((array)$party['options'] as $o) {
                if (!is_array($o)) continue;
                $parts[] = (string)($o['name'] ?? '') . ' 남 ' . _adminLogWon((int)($o['priceMale'] ?? 0))
                    . ' / 여 ' . _adminLogWon((int)($o['priceFemale'] ?? 0));
            }
            return implode(', ', $parts);
        }
        $male   = (int)($party['priceMale']   ?? 0);
        $female = (int)($party['priceFemale'] ?? 0);
        $base   = (int)($party['price']       ?? 0);
        if ($male > 0 || $female > 0) {
            return '남 ' . _adminLogWon($male > 0 ? $male : $base) . ' / 여 ' . _adminLogWon($female > 0 ? $female : $base);
        }
        return _adminLogWon($base);
    }

    /** 그 파티의 예약을 상태별로 센다 — "참가 확정 완료 3건, 취소됨 1건" (없으면 "없음") */
    function _adminLogPartyBookingSummary(string $partyId): string {
        $byStatus = [];
        foreach (glob(dataDir() . '/bookings_*.json') ?: [] as $f) {
            $list = json_decode((string)@file_get_contents($f), true);
            if (!is_array($list)) continue;
            foreach ($list as $b) {
                if (!is_array($b) || (string)($b['partyId'] ?? '') !== $partyId) continue;
                $st = (string)($b['status'] ?? '');
                $byStatus[$st] = ($byStatus[$st] ?? 0) + 1;
            }
        }
        if (!$byStatus) return '없음';
        $parts = [];
        foreach ($byStatus as $st => $n) $parts[] = _adminLogStatusLabel((string)$st) . " {$n}건";
        return implode(', ', $parts);
    }

    /** 값 정리 — 문자열로 바꾸고 깨진 UTF-8 은 고친다 (로그 파일 json_encode 실패 방지). 빈 값은 뺀다 */
    function _adminLogClean(array $d): array {
        $out = [];
        foreach ($d as $k => $v) {
            $s = trim(mb_scrub((string)$v, 'UTF-8'));
            if ($s !== '') $out[(string)$k] = $s;
        }
        return $out;
    }

    /**
     * 삭제된 파티의 상세 정보.
     * @param array $party 삭제 직전의 parties.json 파티 값
     */
    function adminLogPartyDetail(array $party): array {
        $d = [];
        try {
            $pid = (string)($party['id'] ?? '');
            $d['파티']   = _adminLogPartyName($pid, $party);
            $d['종류']   = partyTypeLabel($party);
            $date = trim((string)($party['dateString'] ?? ''));
            $d['일시']   = $date !== '' ? $date : (string)($party['calendarDate'] ?? '');
            $d['장소']   = (string)($party['location'] ?? '');
            $d['대상']   = (string)($party['target'] ?? '');
            $d['참가비'] = _adminLogPartyPrice($party);
            $rate = partyDiscountRate($party);
            if ($rate > 0 && !partyHasOptions($party)) $d['할인율'] = "{$rate}%";
            if (!empty($party['couponDisabled'])) $d['쿠폰'] = '사용 불가 파티';
            $counts = json_decode((string)@file_get_contents(dataDir() . '/party_counts.json'), true);
            $row = is_array($counts[$pid] ?? null) ? $counts[$pid] : [];
            if (partyHasOptions($party)) {
                // 참가 구성 솔로파티 — 정원·신청 인원은 회차마다
                $stock = []; $booked = [];
                foreach ((array)$party['sessions'] as $s) {
                    if (!is_array($s)) continue;
                    $sid  = (string)($s['id'] ?? '');
                    $name = trim((string)($s['name'] ?? '') . ' ' . (string)($s['startTime'] ?? ''));
                    $stock[]  = "{$name} 남 " . sessionStockLimit($s, 'male') . '명 / 여 ' . sessionStockLimit($s, 'female') . '명';
                    $booked[] = "{$name} 남 " . (int)($row['sessions'][$sid]['male'] ?? 0) . '명 / 여 ' . (int)($row['sessions'][$sid]['female'] ?? 0) . '명';
                }
                $d['정원']      = implode(', ', $stock);
                $d['신청 인원'] = implode(', ', $booked) . ' (결제·입금 확인 기준)';
            } else {
                $d['정원']      = '남 ' . partyStockLimit($party, 'male') . '명 / 여 ' . partyStockLimit($party, 'female') . '명';
                $d['신청 인원'] = '남 ' . (int)($row['male'] ?? 0) . '명 / 여 ' . (int)($row['female'] ?? 0) . '명 (결제·입금 확인 기준)';
            }
            $d['예약 현황'] = _adminLogPartyBookingSummary($pid) . ' — 파티를 지워도 예약은 그대로 남습니다';

            $d['담당자'] = (string)($party['host_name'] ?? '');
            if (($party['status'] ?? '') === 'completed') {
                $d['진행 상태'] = '모임종료';
            } else {
                $vs = (string)($party['voting_status'] ?? 'closed');
                if ($vs === 'open')      $d['진행 상태'] = '매칭 투표 진행 중';
                if ($vs === 'finalized') $d['진행 상태'] = '매칭 투표 결과 확정';
            }
        } catch (Throwable $e) {
            error_log('[admin/_log_detail party] ' . $e->getMessage());
        }
        return _adminLogClean($d);
    }

    /**
     * 삭제된 파티 값(로그 "변경 전") — 상세 안내(detail)는 길어서 개수 요약으로 바꾼다. 실패하면 null.
     */
    function adminLogPartySnapshot(array $party): ?array {
        try {
            if (isset($party['detail']) && is_array($party['detail'])) {
                $party['detail'] = '상세 안내(' . partyDetailCounts($party['detail']) . ')';
            }
            return $party;
        } catch (Throwable $e) {
            error_log('[admin/_log_detail snapshot] ' . $e->getMessage());
            return null;
        }
    }

    /**
     * 취소·환불한 예약의 상세 정보.
     * @param string $email   회원 이메일
     * @param array  $booking 처리 직전의 예약 값
     * @param array  $result  처리 결과 항목 (환불 금액·인원 반영 등) — 예약 정보 뒤에 붙인다
     */
    function adminLogBookingDetail(string $email, array $booking, array $result = []): array {
        $d = [];
        try {
            $name = _adminLogUserName($email);
            $d['회원'] = $name !== '' ? "{$name} ({$email})" : $email;
            $d['성별'] = (string)($booking['gender'] ?? '');

            $pid   = (string)($booking['partyId'] ?? '');
            $party = _adminLogFindParty($pid);
            $d['파티'] = _adminLogPartyName($pid, $party);
            if ($party !== null) {
                $d['파티 종류'] = partyTypeLabel($party);
                $d['파티 일시'] = (string)($party['dateString'] ?? '');
            }
            $opt = trim((string)($booking['optionName'] ?? ''));
            if ($opt !== '') {
                $times = bookingSessionTimes($booking, $party);
                $d['참가 항목'] = $opt . ($times ? ' (' . implode(', ', $times) . ')' : '');
            }

            $d['예약 번호'] = (string)($booking['id'] ?? '');
            $d['신청일']    = _adminLogTime($booking['createdAt'] ?? '');
            $isVbank = (string)($booking['paymentMethod'] ?? '') === 'vbank';
            $d['결제 수단'] = $isVbank ? '무통장 입금' : '카드';
            $d['결제 금액'] = _adminLogWon((int)($booking['total'] ?? 0));
            $coupon = (string)($booking['couponCode'] ?? '');
            if ($coupon !== '') $d['쿠폰'] = $coupon . ' (-' . _adminLogWon((int)($booking['discount'] ?? 0)) . ')';
            if ($isVbank) {
                $paidAt = _adminLogTime($booking['vbankPaidAt'] ?? '');
                $d['입금 확인'] = $paidAt !== '' ? $paidAt : '입금 확인 전';
            }
            $d['토스 주문번호'] = (string)($booking['tossOrderId'] ?? '');
            $d['이전 상태'] = _adminLogStatusLabel((string)($booking['status'] ?? ''));

            $refundedAt = _adminLogTime($booking['refundedAt'] ?? '');
            if ($refundedAt !== '') {
                $d['이전 환불'] = $refundedAt . ', ' . _adminLogWon((int)($booking['refundAmount'] ?? 0));
            }
            $reqAt = _adminLogTime($booking['cancelRequestedAt'] ?? '');
            if ($reqAt !== '') $d['취소 요청일'] = $reqAt;
            if (isset($booking['refundRequestAmount']) && is_numeric($booking['refundRequestAmount'])) {
                $d['요청 시 환불 기준'] = '파티 ' . (int)($booking['refundRequestDays'] ?? 0) . '일 전, '
                    . (int)round((float)($booking['refundRequestRate'] ?? 0) * 100) . '% → '
                    . _adminLogWon((int)$booking['refundRequestAmount']);
            }
        } catch (Throwable $e) {
            error_log('[admin/_log_detail booking] ' . $e->getMessage());
        }
        // 처리 결과 항목이 예약 정보와 이름이 겹치면 처리 결과로 덮어쓴다
        return _adminLogClean(array_merge($d, $result));
    }

    /**
     * 처리 결과 "신청 인원" 문구 — bookings.php 가 실제로 인원을 뺐는지($counted)를 그대로 받아 적는다.
     * 성별은 bookings.php 와 같은 규칙(남성이 아니면 여성 칸)으로 적는다.
     */
    function adminLogCountResult(array $booking, bool $counted): string {
        if (!$counted) {
            return (string)($booking['paymentMethod'] ?? '') === 'vbank' && empty($booking['vbankPaidAt'])
                ? '변동 없음 (무통장 입금 확인 전 예약)' : '변동 없음';
        }
        $g = (string)($booking['gender'] ?? '') === '남성' ? '남성' : '여성';
        return "{$g} 1명 차감" . (!empty($booking['sessionIds']) ? ' (참가 회차 인원 포함)' : '');
    }

    /** 처리 결과 "쿠폰 복원" 문구 — 쿠폰을 쓰지 않은 예약은 '' (상세 정보에서 빠진다) */
    function adminLogCouponResult(array $booking): string {
        $code = (string)($booking['couponCode'] ?? '');
        return $code !== '' ? "{$code} 다시 사용할 수 있게 복원" : '';
    }
}
