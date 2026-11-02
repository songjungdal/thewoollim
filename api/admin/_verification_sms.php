<?php
/**
 * 사진 심사 · 직업 인증 결과 알림 문자 (docs/specs/photo-job-verification.md 4-3).
 *  - 호출 위치: api/admin/verifications.php 의 승인·반려 저장 직후
 *  - 절대 throw 하지 않음 — 오류는 로그만 남기고 관리자 처리 응답에 영향 없음
 *  - 발송 제외: 관리자·테스트 회원 (isSmsExcludedAccount — 다른 알림 문자와 같은 규칙)
 *  - 90 byte 초과면 LMS
 *
 * 발신 환경: api/auth/sms-config.php (apikey/userid/sender) — 다른 알림 문자와 같은 파일.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';

if (!function_exists('notifyVerificationSms')) {

    /** 문구 (명세 4-3 그대로) */
    function verificationSmsText(string $kind, bool $approved, string $reason): string {
        if ($kind === 'photo') {
            return $approved
                ? '[어울림] 사진 심사가 완료되었습니다. 이제 원하시는 파티를 신청하실 수 있어요. thewoollim.com'
                : "[어울림] 사진 심사 결과 다시 등록이 필요합니다. 사유: {$reason} / 마이페이지 > 인증 관리에서 다시 등록해주세요.";
        }
        return $approved
            ? "[어울림] 직업 인증이 완료되었습니다. 파티 참여자 명단에 '직업 인증' 배지가 표시됩니다."
            : "[어울림] 직업 인증 결과 다시 제출이 필요합니다. 사유: {$reason}";
    }

    function notifyVerificationSms(int $userId, string $kind, bool $approved, string $reason = ''): void {
        $tag = "user={$userId} kind={$kind} " . ($approved ? 'approved' : 'rejected');
        try {
            $stmt = getDB()->prepare("SELECT email, phone, role FROM users WHERE id = ? AND status = 'active' LIMIT 1");
            $stmt->execute([$userId]);
            $u = $stmt->fetch();
            if (!$u) { _verificationSmsLog($tag, 'skip', 'user not found'); return; }
            if (isSmsExcludedAccount((string)$u['email'], (string)($u['role'] ?? ''))) {
                _verificationSmsLog($tag, 'skip', 'test/admin account');
                return;
            }
            $phone = preg_replace('/\D+/', '', (string)($u['phone'] ?? ''));
            if ($phone === '' || strlen($phone) < 10 || !str_starts_with($phone, '01')) {
                _verificationSmsLog($tag, 'skip', 'invalid phone');
                return;
            }

            $cfgPath = __DIR__ . '/../auth/sms-config.php';
            if (!file_exists($cfgPath)) { _verificationSmsLog($tag, 'error', 'sms-config.php missing'); return; }
            $cfg = require $cfgPath;

            $msg     = verificationSmsText($kind, $approved, $reason);
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
            if ($msgType === 'LMS') $params['title'] = $kind === 'photo' ? '[어울림] 사진 심사 안내' : '[어울림] 직업 인증 안내';

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
            _verificationSmsLog($tag, $resCode === '1' ? 'sent' : 'fail', sprintf(
                'type=%s http=%d code=%s msg=%s err=%s',
                $msgType, $resHttp, $resCode,
                substr((string)($resJson['message'] ?? ''), 0, 80),
                substr((string)$resErr, 0, 80)
            ));
        } catch (Throwable $e) {
            _verificationSmsLog($tag, 'exception', substr($e->getMessage(), 0, 120));
        }
    }

    function _verificationSmsLog(string $tag, string $status, string $detail): void {
        @file_put_contents(
            dataDir() . '/_verification_sms.log',
            sprintf("[%s] %s %s %s\n", date('c'), $status, $tag, $detail),
            FILE_APPEND
        );
    }
}
