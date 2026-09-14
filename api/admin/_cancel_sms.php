<?php
/**
 * 취소(cancel) / 100%환불(cancel_full_refund) 처리 성공 직후 회원에게 보내는
 * 알리고 알림 문자(취소 완료 안내) 핸들러.
 *  - 호출 위치: api/admin/bookings.php 의 action==='cancel' 또는 'cancel_full_refund' → saveBookings() 성공 직후
 *  - 절대 throw 하지 않음: 모든 오류를 try/catch 로 삼키고 로그만 남겨, 취소 응답/DB 상태 변경/관리자 화면에 영향 0
 *  - 테스트/관리자 계정은 발송 제외
 *  - 문구가 길어 자동으로 LMS 처리 (90 byte 초과 시)
 *
 * 발신 환경: api/auth/sms-config.php (apikey/userid/sender) — send-sms.php / _confirm_sms.php / _pending_sms.php 와 동일 소스.
 * (참고: 프로젝트 루트 .env는 Next.js 빌드 타임 전용이라 PHP가 읽지 않음 — 기존 관례를 그대로 따름)
 */

declare(strict_types=1);

if (!function_exists('notifyCancelSms')) {

    /** 발송 제외 대상(테스트/관리자) 이메일 — 소문자 비교. _confirm_sms.php / _pending_sms.php 와 동일 규칙 */
    function _cancelSmsIsTestAccount(string $email, string $role): bool {
        $email = strtolower(trim($email));
        if ($role === 'admin') return true;                         // 관리자 role 제외
        if (str_ends_with($email, '@woollim.local')) return true;    // 관리자 계정 도메인 제외
        // 테스트 계정 패턴: a1~a10@naver.com, b1~b10@naver.com
        if (preg_match('/^[ab](?:[1-9]|10)@naver\.com$/', $email)) return true;
        return false;
    }

    /** dateString('2026년 05월 29일 (금) 19:00') → ['date'=>'2026년 05월 29일 (금)', 'time'=>'19:00'] */
    function _cancelSmsSplitDate(string $dateString): array {
        $time = '';
        if (preg_match('/(\d{1,2}:\d{2})/', $dateString, $m)) $time = $m[1];
        $date = $time !== '' ? trim(str_replace($time, '', $dateString)) : trim($dateString);
        return ['date' => $date, 'time' => $time];
    }

    /**
     * @param string $email   취소 처리된 회원 이메일
     * @param array  $booking 취소 전 booking 레코드 스냅샷 (partyId 포함)
     */
    function notifyCancelSms(string $email, array $booking): void {
        try {
            // 1) 회원 정보 (이름/연락처/role) 조회
            $pdo  = getDB();
            $stmt = $pdo->prepare("SELECT name, phone, role, email FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
            $stmt->execute([$email]);
            $u = $stmt->fetch();
            if (!$u) { _cancelSmsLog($email, 'skip', 'user not found'); return; }

            $role = (string)($u['role'] ?? '');
            if (_cancelSmsIsTestAccount((string)($u['email'] ?? $email), $role)) {
                _cancelSmsLog($email, 'skip', 'test/admin account');
                return;
            }

            $name  = (string)($u['name'] ?? '');
            $phone = preg_replace('/\D+/', '', (string)($u['phone'] ?? '')); // 하이픈 제거
            if ($phone === '' || strlen($phone) < 10 || !str_starts_with($phone, '01')) {
                _cancelSmsLog($email, 'skip', 'invalid phone');
                return;
            }

            // 2) 파티 정보 (일시/장소)
            $partyId = (string)($booking['partyId'] ?? '');
            $loc = $dateString = '';
            $parties = json_decode((string)@file_get_contents(dataDir() . '/parties.json'), true);
            if (is_array($parties)) {
                foreach ($parties as $p) {
                    if ((string)($p['id'] ?? '') === $partyId) {
                        $loc        = (string)($p['location']   ?? '');
                        $dateString = (string)($p['dateString'] ?? '');
                        break;
                    }
                }
            }
            $dt    = _cancelSmsSplitDate($dateString);
            $pdate = $dt['date'] !== '' ? $dt['date'] : '추후 안내';
            $ptime = $dt['time'] !== '' ? $dt['time'] : '추후 안내';

            // 3) 메시지 — 템플릿 (줄바꿈/특수문자 그대로 유지)
            $msg =
                "[어울림] 매칭파티 취소 완료 안내\n" .
                "안녕하세요, {$name}님.\n" .
                "신청하신 매칭파티 일정이 정상적으로 취소되었습니다.\n" .
                "일시: {$pdate}\n" .
                "시간: {$ptime}\n" .
                "장소: {$loc}\n" .
                "• 카드 결제: 카드사 사정에 따라 영업일 기준 2~3일 내 승인 취소/환불됩니다.\n" .
                "• 무통장 입금: 운영팀에서 개별적으로 환불 계좌를 확인하여 환불처리됩니다.\n" .
                "파티 취소 규정에 따라 환불 금액이 산정되며, 자세한 내역은 홈페이지 마이페이지에서 확인하실 수 있습니다.\n" .
                "다음번에 더 좋은 인연으로 모실 수 있기를 바랍니다. 감사합니다.";

            // 4) 발신 설정
            $cfgPath = __DIR__ . '/../auth/sms-config.php';
            if (!file_exists($cfgPath)) { _cancelSmsLog($email, 'error', 'sms-config.php missing'); return; }
            $cfg = require $cfgPath;

            // 90 byte 초과 → LMS 자동 분기 (한글 LMS 안전 처리)
            $msgType = strlen($msg) > 90 ? 'LMS' : 'SMS';

            $params = [
                'key'         => $cfg['apikey'],
                'user_id'     => $cfg['userid'],
                'sender'      => preg_replace('/\D+/', '', (string)$cfg['sender']),
                'receiver'    => $phone,
                'msg'         => $msg,
                'msg_type'    => $msgType,
                'testmode_yn' => 'N',
            ];
            if ($msgType === 'LMS') $params['title'] = '[어울림] 취소 완료 안내';

            $ch = curl_init('https://apis.aligo.in/send/');
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => http_build_query($params),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
            ]);
            $resBody = curl_exec($ch);
            $resHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $resErr  = curl_error($ch);
            // PHP 8.0+ 에서 curl 핸들은 객체라 GC 가 자동 해제 → curl_close 불필요(8.5 deprecated)

            $resJson = is_string($resBody) ? (json_decode($resBody, true) ?: []) : [];
            $resCode = (string)($resJson['result_code'] ?? '');

            _cancelSmsLog($email, $resCode === '1' ? 'sent' : 'fail', sprintf(
                'phone=%s type=%s http=%d code=%s msg=%s err=%s',
                $phone, $msgType, $resHttp, $resCode,
                substr((string)($resJson['message'] ?? ''), 0, 80),
                substr((string)$resErr, 0, 80)
            ));
        } catch (Throwable $e) {
            // 어떤 경우에도 호출부(취소 처리 응답/DB 상태 변경)에 영향 주지 않음
            _cancelSmsLog($email, 'exception', substr($e->getMessage(), 0, 120));
        }
    }

    function _cancelSmsLog(string $email, string $status, string $detail): void {
        @file_put_contents(
            dataDir() . '/_cancel_sms.log',
            sprintf("[%s] %s email=%s %s\n", date('c'), $status, $email, $detail),
            FILE_APPEND
        );
    }
}
