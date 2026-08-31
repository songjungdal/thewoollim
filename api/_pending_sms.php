<?php
/**
 * 예약 상태가 '확정 대기중'(pending_approval)으로 전환된 직후 회원에게 보내는
 * 알리고 알림 문자(신청접수 안내) 핸들러.
 *  - 호출 위치 (status → 'pending_approval' 로 UPDATE 완료 직후):
 *      · api/payments/success.php   — 카드결제 직후 프로필 이미 완성된 경우
 *      · api/profile.php            — 프로필 카드 작성 완료로 paid_pending_profile → pending_approval 전환된 경우
 *      · api/admin/bookings.php     — 무통장 입금 확인(confirm_vbank) 후 프로필 완성된 경우
 *  - 절대 throw 하지 않음: 모든 오류를 try/catch 로 삼키고 로그만 남겨, 결제/화면 흐름에 영향 0
 *  - 테스트/관리자 계정은 발송 제외
 *  - 문구가 길어 자동으로 LMS 처리 (90 byte 초과 시)
 *
 * 발신 환경: api/auth/sms-config.php (apikey/userid/sender) — send-sms.php / _confirm_sms.php 와 동일 소스.
 * (참고: 프로젝트 루트 .env는 Next.js 빌드 타임 전용이라 PHP가 읽지 않음 — 기존 관례를 그대로 따름)
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';

if (!function_exists('notifyPendingSms')) {

    /** 발송 제외 대상(테스트/관리자) 이메일 — 소문자 비교 */
    function _pendingSmsIsTestAccount(string $email, string $role): bool {
        $email = strtolower(trim($email));
        if ($role === 'admin') return true;                         // 관리자 role 제외
        if (str_ends_with($email, '@woollim.local')) return true;    // 관리자 계정 도메인 제외
        // 테스트 계정 패턴: a1~a10@naver.com, b1~b10@naver.com
        if (preg_match('/^[ab](?:[1-9]|10)@naver\.com$/', $email)) return true;
        return false;
    }

    /** dateString('2026년 05월 29일 (금) 19:00') → ['date'=>'2026년 05월 29일 (금)', 'time'=>'19:00'] */
    function _pendingSmsSplitDate(string $dateString): array {
        $time = '';
        if (preg_match('/(\d{1,2}:\d{2})/', $dateString, $m)) $time = $m[1];
        $date = $time !== '' ? trim(str_replace($time, '', $dateString)) : trim($dateString);
        return ['date' => $date, 'time' => $time];
    }

    /**
     * @param string $email   신청 접수된(확정 대기중 전환된) 회원 이메일
     * @param array  $booking 전환된 booking 레코드 (partyId 포함)
     */
    function notifyPendingSms(string $email, array $booking): void {
        try {
            // 1) 회원 정보 (이름/연락처/role) 조회
            $pdo  = getDB();
            $stmt = $pdo->prepare("SELECT name, phone, role, email FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
            $stmt->execute([$email]);
            $u = $stmt->fetch();
            if (!$u) { _pendingSmsLog($email, 'skip', 'user not found'); return; }

            $role = (string)($u['role'] ?? '');
            if (_pendingSmsIsTestAccount((string)($u['email'] ?? $email), $role)) {
                _pendingSmsLog($email, 'skip', 'test/admin account');
                return;
            }

            $name  = (string)($u['name'] ?? '');
            $phone = preg_replace('/\D+/', '', (string)($u['phone'] ?? '')); // 하이픈 제거
            if ($phone === '' || strlen($phone) < 10 || !str_starts_with($phone, '01')) {
                _pendingSmsLog($email, 'skip', 'invalid phone');
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
            $dt    = _pendingSmsSplitDate($dateString);
            $pdate = $dt['date'] !== '' ? $dt['date'] : '추후 안내';
            $ptime = $dt['time'] !== '' ? $dt['time'] : '추후 안내';

            // 3) 메시지 — 템플릿 (줄바꿈/특수문자 그대로 유지)
            $msg =
                "{$name}님, [어울림] 매칭파티 신청이 정상적으로 접수되었습니다.\n\n" .
                "{$title}\n" .
                "일시: {$pdate}\n" .
                "시간: {$ptime}\n" .
                "장소: {$loc}\n\n" .
                "원활한 매칭을 위해 검토 후 참가확정 문자를 순차적으로 발송해 드릴 예정입니다.";

            // 4) 발신 설정
            $cfgPath = __DIR__ . '/auth/sms-config.php';
            if (!file_exists($cfgPath)) { _pendingSmsLog($email, 'error', 'sms-config.php missing'); return; }
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
            if ($msgType === 'LMS') $params['title'] = '[어울림] 참가신청 완료';

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

            _pendingSmsLog($email, $resCode === '1' ? 'sent' : 'fail', sprintf(
                'phone=%s type=%s http=%d code=%s msg=%s err=%s',
                $phone, $msgType, $resHttp, $resCode,
                substr((string)($resJson['message'] ?? ''), 0, 80),
                substr((string)$resErr, 0, 80)
            ));
        } catch (Throwable $e) {
            // 어떤 경우에도 호출부(결제/프로필/입금확인 응답)에 영향 주지 않음
            _pendingSmsLog($email, 'exception', substr($e->getMessage(), 0, 120));
        }
    }

    function _pendingSmsLog(string $email, string $status, string $detail): void {
        @file_put_contents(
            dataDir() . '/_pending_sms.log',
            sprintf("[%s] %s email=%s %s\n", date('c'), $status, $email, $detail),
            FILE_APPEND
        );
    }
}
