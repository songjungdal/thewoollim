<?php
/**
 * 파티 취소 안내 알리고 문자 (docs/specs/party-recruit-close-cancel.md 6-2 5번).
 *  - 호출 위치: api/admin/parties.php cancel_party / cancel_retry — 예약 하나를 취소 처리한 직후, 예약마다 1회
 *  - 기존 문자 제외 규칙(isSmsExcludedAccount — 관리자·테스트 회원)을 그대로 쓴다
 *  - 절대 throw 하지 않음: 오류는 로그만 남기고 파티 취소 처리에 영향 0
 *  - 90 byte 초과면 장문(LMS), 제목 "[어울림] 파티 취소 안내"
 *
 * 발신 환경: api/auth/sms-config.php (apikey/userid/sender) — 기존 SMS 발송 파일들과 같은 소스.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';

if (!function_exists('notifyPartyCancelSms')) {

    /** 받침이 있으면 "이", 없으면 "가" — 한글이 아니면 "이(가)" */
    function _partyCancelSubjectParticle(string $word): string {
        $last = mb_substr(trim($word), -1);
        if ($last === '') return '이(가)';
        $code = mb_ord($last, 'UTF-8');
        if ($code < 0xAC00 || $code > 0xD7A3) return '이(가)';
        return (($code - 0xAC00) % 28) !== 0 ? '이' : '가';
    }

    /** 받침이 없거나 ㄹ 받침이면 "로", 그 밖의 받침이면 "으로" ("주최측 사정" → "주최측 사정으로") — 한글이 아니면 "(으)로" */
    function _partyCancelReasonParticle(string $word): string {
        $last = mb_substr(trim($word), -1);
        if ($last === '') return '(으)로';
        $code = mb_ord($last, 'UTF-8');
        if ($code < 0xAC00 || $code > 0xD7A3) return '(으)로';
        $jong = ($code - 0xAC00) % 28;
        return ($jong === 0 || $jong === 8) ? '로' : '으로';
    }

    /**
     * 문자 본문 (명세 6-2 5번 문구 그대로 — "이(가)"·"로"는 앞 글자 받침에 맞춰 고른다)
     * @param string $kind 'card' | 'vbank_paid' | 'vbank_pending'
     */
    function partyCancelSmsText(array $party, string $kind, int $amount, string $reason): string {
        $cd = (string)($party['calendarDate'] ?? '');
        $mmdd = preg_match('/^\d{4}-(\d{2})-(\d{2})$/', $cd, $m) ? "{$m[1]}/{$m[2]}" : '';
        $title = (string)($party['title'] ?? '');
        $head = "[어울림] 파티 취소 안내\n"
            . trim($mmdd . ' ' . $title) . _partyCancelSubjectParticle($title) . " {$reason}" . _partyCancelReasonParticle($reason) . ' 취소되었습니다.';
        $won = number_format($amount);
        if ($kind === 'card') {
            return $head . " 결제하신 {$won}원은 전액 취소되며, 카드사에 따라 환불 반영까지 시간이 걸릴 수 있습니다. 불편을 드려 죄송합니다.";
        }
        if ($kind === 'vbank_paid') {
            return $head . " 입금하신 {$won}원은 전액 환불해 드립니다. 환불받으실 계좌를 이 번호로 문자 주시면 송금해 드리겠습니다.";
        }
        return $head . ' 아직 입금 전이시라면 입금하지 않으셔도 됩니다.';
    }

    /**
     * @param string $email  회원 이메일
     * @param array  $party  취소된 파티 (parties.json 항목)
     * @param string $kind   'card' | 'vbank_paid' | 'vbank_pending'
     * @param int    $amount 환불 금액 (무통장 입금 대기는 0)
     * @param string $reason 취소 사유 (관리자 입력, 50자 이하)
     */
    function notifyPartyCancelSms(string $email, array $party, string $kind, int $amount, string $reason): void {
        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare("SELECT phone, role, email FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
            $stmt->execute([$email]);
            $u = $stmt->fetch();
            if (!$u) { _partyCancelSmsLog($email, 'skip', 'user not found'); return; }

            if (isSmsExcludedAccount((string)($u['email'] ?? $email), (string)($u['role'] ?? ''))) {
                _partyCancelSmsLog($email, 'skip', 'test/admin account');
                return;
            }
            $phone = preg_replace('/\D+/', '', (string)($u['phone'] ?? ''));
            if ($phone === '' || strlen($phone) < 10 || !str_starts_with($phone, '01')) {
                _partyCancelSmsLog($email, 'skip', 'invalid phone');
                return;
            }

            $msg = partyCancelSmsText($party, $kind, $amount, $reason);

            $cfgPath = __DIR__ . '/../auth/sms-config.php';
            if (!file_exists($cfgPath)) { _partyCancelSmsLog($email, 'error', 'sms-config.php missing'); return; }
            $cfg = require $cfgPath;

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
            if ($msgType === 'LMS') $params['title'] = '[어울림] 파티 취소 안내';

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

            _partyCancelSmsLog($email, $resCode === '1' ? 'sent' : 'fail', sprintf(
                'partyId=%s kind=%s type=%s http=%d code=%s msg=%s err=%s',
                (string)($party['id'] ?? ''), $kind, $msgType, $resHttp, $resCode,
                substr((string)($resJson['message'] ?? ''), 0, 80),
                substr((string)$resErr, 0, 80)
            ));
        } catch (Throwable $e) {
            _partyCancelSmsLog($email, 'exception', substr($e->getMessage(), 0, 120));
        }
    }

    function _partyCancelSmsLog(string $email, string $status, string $detail): void {
        @file_put_contents(
            dataDir() . '/_party_cancel_sms.log',
            sprintf("[%s] %s email=%s %s\n", date('c'), $status, $email, $detail),
            FILE_APPEND
        );
    }
}
