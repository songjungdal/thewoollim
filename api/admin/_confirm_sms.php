<?php
/**
 * 참가확정(approve) 성공 직후 회원에게 보내는 알리고 알림 문자 핸들러.
 *  - 호출 위치: api/admin/bookings.php 의 action==='approve' → saveBookings() 성공 직후
 *  - 절대 throw 하지 않음: 모든 오류를 try/catch 로 삼키고 로그만 남겨, 참가확정 응답/관리자 화면에 영향 0
 *  - 테스트/관리자 계정은 발송 제외
 *  - 문구가 길어 자동으로 LMS 처리 (90 byte 초과 시)
 *
 * 발신 환경: api/auth/sms-config.php (apikey/userid/sender) — send-sms.php 와 동일 소스.
 */

declare(strict_types=1);

if (!function_exists('notifyConfirmSms')) {

    /** 발송 제외 대상(테스트/관리자) 이메일 — 소문자 비교 */
    function _confirmSmsIsTestAccount(string $email, string $role): bool {
        $email = strtolower(trim($email));
        if ($role === 'admin') return true;                 // 관리자 role 제외
        if (str_ends_with($email, '@woollim.local')) return true; // 관리자 계정 도메인 제외
        $testList = [
            'a1@naver.com',
            'pletora@naver.com',
        ];
        return in_array($email, $testList, true);
    }

    /** dateString('2026년 05월 29일 (금) 19:00') → ['date'=>'2026년 05월 29일 (금)', 'time'=>'19:00'] */
    function _confirmSmsSplitDate(string $dateString): array {
        $time = '';
        if (preg_match('/(\d{1,2}:\d{2})/', $dateString, $m)) $time = $m[1];
        $date = $time !== '' ? trim(str_replace($time, '', $dateString)) : trim($dateString);
        return ['date' => $date, 'time' => $time];
    }

    /**
     * @param string $email   참가확정된 회원 이메일
     * @param array  $booking 확정된 booking 레코드 (partyId 포함)
     */
    function notifyConfirmSms(string $email, array $booking): void {
        try {
            // 1) 회원 정보 (이름/연락처/role) 조회
            $pdo  = getDB();
            $stmt = $pdo->prepare("SELECT name, phone, role, email FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
            $stmt->execute([$email]);
            $u = $stmt->fetch();
            if (!$u) { _confirmSmsLog($email, 'skip', 'user not found'); return; }

            $role = (string)($u['role'] ?? '');
            if (_confirmSmsIsTestAccount((string)($u['email'] ?? $email), $role)) {
                _confirmSmsLog($email, 'skip', 'test/admin account');
                return;
            }

            $name  = (string)($u['name'] ?? '');
            $phone = preg_replace('/\D+/', '', (string)($u['phone'] ?? '')); // 하이픈 제거
            if ($phone === '' || strlen($phone) < 10 || !str_starts_with($phone, '01')) {
                _confirmSmsLog($email, 'skip', 'invalid phone');
                return;
            }

            // 2) 파티 정보 (제목/일시/장소)
            $partyId = (string)($booking['partyId'] ?? '');
            $title = $loc = $dateString = '';
            $parties = json_decode((string)@file_get_contents(dataDir() . '/parties.json'), true);
            if (is_array($parties)) {
                foreach ($parties as $p) {
                    if ((string)($p['id'] ?? '') === $partyId) {
                        $title      = (string)($p['title']      ?? '');
                        $loc        = (string)($p['location']   ?? '');
                        $dateString = (string)($p['dateString'] ?? '');
                        break;
                    }
                }
            }
            $dt    = _confirmSmsSplitDate($dateString);
            $pdate = $dt['date'] !== '' ? $dt['date'] : '추후 안내';
            $ptime = $dt['time'] !== '' ? $dt['time'] : '추후 안내';

            // 3) 메시지 — 템플릿 (줄바꿈/특수문자 그대로 유지)
            $msg =
                "{$name}님, [어울림] 매칭파티 참가가 확정되었습니다!\n\n" .
                "{$title}\n" .
                "일시: {$pdate}\n" .
                "시간: {$ptime}\n" .
                "장소: {$loc}\n\n" .
                "첫인상을 더 빛내줄 단정한 복장으로 늦지 않게 도착해 주세요. 설레는 마음으로 기다리고 있겠습니다.";

            // 4) 발신 설정
            $cfgPath = __DIR__ . '/../auth/sms-config.php';
            if (!file_exists($cfgPath)) { _confirmSmsLog($email, 'error', 'sms-config.php missing'); return; }
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
            if ($msgType === 'LMS') $params['title'] = '[어울림] 참가확정 안내';

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

            _confirmSmsLog($email, $resCode === '1' ? 'sent' : 'fail', sprintf(
                'phone=%s type=%s http=%d code=%s msg=%s err=%s',
                $phone, $msgType, $resHttp, $resCode,
                substr((string)($resJson['message'] ?? ''), 0, 80),
                substr((string)$resErr, 0, 80)
            ));
        } catch (Throwable $e) {
            // 어떤 경우에도 호출부(참가확정 응답)에 영향 주지 않음
            _confirmSmsLog($email, 'exception', substr($e->getMessage(), 0, 120));
        }
    }

    function _confirmSmsLog(string $email, string $status, string $detail): void {
        @file_put_contents(
            dataDir() . '/_confirm_sms.log',
            sprintf("[%s] %s email=%s %s\n", date('c'), $status, $email, $detail),
            FILE_APPEND
        );
    }
}
