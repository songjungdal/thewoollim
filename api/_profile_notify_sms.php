<?php
/**
 * '결제완료(프로필 대기)'(paid_pending_profile) 회원 대상 프로필 작성 안내 알리고 문자.
 *  - 1차(즉시) 호출 위치 (status → 'paid_pending_profile' 로 UPDATE 완료 직후):
 *      · api/payments/success.php   — 카드결제 직후 프로필 미완성인 경우
 *      · api/admin/bookings.php     — 무통장 입금 확인(confirm_vbank) 후 프로필 미완성인 경우
 *  - 2차(24시간 리마인드) 호출 위치: api/cron/profile_24h_reminder.php (독립 스케줄러)
 *  - 절대 throw 하지 않음: 모든 오류를 try/catch 로 삼키고 로그만 남겨, 결제/화면 흐름에 영향 0
 *  - 테스트/관리자 계정은 발송 제외
 *  - 문구가 길어 자동으로 LMS 처리 (90 byte 초과 시)
 *
 * 발신 환경: api/auth/sms-config.php (apikey/userid/sender) — 기존 SMS 발송 파일들과 동일 소스.
 * (참고: 프로젝트 루트 .env는 Next.js 빌드 타임 전용이라 PHP가 읽지 않음 — 기존 관례 그대로 유지)
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';

if (!function_exists('notifyProfileReminderSms')) {

    /** 발송 제외 대상(테스트/관리자) 이메일 — 소문자 비교 */
    function _profileNotifyIsTestAccount(string $email, string $role): bool {
        $email = strtolower(trim($email));
        if ($role === 'admin') return true;                         // 관리자 role 제외
        if (str_ends_with($email, '@woollim.local')) return true;    // 관리자 계정 도메인 제외
        // 테스트 계정 패턴: a1~a10@naver.com, b1~b10@naver.com
        if (preg_match('/^[ab](?:[1-9]|10)@naver\.com$/', $email)) return true;
        return false;
    }

    /**
     * @param string $email    결제완료(프로필 대기) 상태인 회원 이메일
     * @param string $bookingId 로그 식별용 booking id (선택)
     * @param string $stage    'initial'(1차 즉시) | '24h'(2차 리마인드) — 로그 구분용, 문구는 동일
     */
    function notifyProfileReminderSms(string $email, string $bookingId = '', string $stage = 'initial'): void {
        try {
            // 1) 회원 정보 (이름/연락처/role) 조회
            $pdo  = getDB();
            $stmt = $pdo->prepare("SELECT name, phone, role, email FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
            $stmt->execute([$email]);
            $u = $stmt->fetch();
            if (!$u) { _profileNotifyLog($stage, $email, $bookingId, 'skip', 'user not found'); return; }

            $role = (string)($u['role'] ?? '');
            if (_profileNotifyIsTestAccount((string)($u['email'] ?? $email), $role)) {
                _profileNotifyLog($stage, $email, $bookingId, 'skip', 'test/admin account');
                return;
            }

            $name  = (string)($u['name'] ?? '');
            $phone = preg_replace('/\D+/', '', (string)($u['phone'] ?? '')); // 하이픈 제거
            if ($phone === '' || strlen($phone) < 10 || !str_starts_with($phone, '01')) {
                _profileNotifyLog($stage, $email, $bookingId, 'skip', 'invalid phone');
                return;
            }

            // 2) 메시지 — 템플릿 (줄바꿈/특수문자 그대로 유지, 파티 정보 불필요)
            $msg =
                "{$name}님, [어울림] 프로필 작성 안내\n" .
                "만족도 높은 매칭을 위해 프로필 작성을 완성해주세요. [어울림] 홈페이지의 마이페이지에서 프로필 작성을 완성해주셔야 최종 참가 검토가 진행됩니다. (※ 미작성 시 참가가 제한되거나 참가확정이 지연될 수 있습니다.)";

            // 3) 발신 설정
            $cfgPath = __DIR__ . '/auth/sms-config.php';
            if (!file_exists($cfgPath)) { _profileNotifyLog($stage, $email, $bookingId, 'error', 'sms-config.php missing'); return; }
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
            if ($msgType === 'LMS') $params['title'] = '[어울림] 프로필 작성 안내';

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

            $resJson = is_string($resBody) ? (json_decode($resBody, true) ?: []) : [];
            $resCode = (string)($resJson['result_code'] ?? '');

            _profileNotifyLog($stage, $email, $bookingId, $resCode === '1' ? 'sent' : 'fail', sprintf(
                'phone=%s type=%s http=%d code=%s msg=%s err=%s',
                $phone, $msgType, $resHttp, $resCode,
                substr((string)($resJson['message'] ?? ''), 0, 80),
                substr((string)$resErr, 0, 80)
            ));
        } catch (Throwable $e) {
            // 어떤 경우에도 호출부(결제/입금확인 응답)에 영향 주지 않음
            _profileNotifyLog($stage, $email, $bookingId, 'exception', substr($e->getMessage(), 0, 120));
        }
    }

    function _profileNotifyLog(string $stage, string $email, string $bookingId, string $status, string $detail): void {
        @file_put_contents(
            dataDir() . '/_profile_notify_sms.log',
            sprintf("[%s] stage=%s %s email=%s bookingId=%s %s\n", date('c'), $stage, $status, $email, $bookingId, $detail),
            FILE_APPEND
        );
    }
}
