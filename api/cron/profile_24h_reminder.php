<?php
/**
 * 결제완료(프로필 대기) 상태 24시간 경과 리마인드 알림 문자 — 알리고.
 *
 * 실행: CLI 전용 배치 스크립트(웹 접근 403). 실제 SMS 비용이 발생하는 배치라
 * 공개 HTTP 엔드포인트로 노출하지 않음. api/cron/d1_reminder.php 와 완전히 독립된
 * 스케줄러 — 서로의 로직/로그/발송 조건에 전혀 영향을 주지 않음.
 *   예) systemd timer, 매시 정각 실행 (하루 1회가 아닌 이유: 결제 시각이 제각각이라
 *       24시간 경과 시점을 최대한 정확히 맞추기 위함 — 멱등 플래그가 있어 자주 돌려도 안전)
 *
 * 대상 조건 (모두 충족):
 *  - status === 'paid_pending_profile' (그 사이 확정대기/참가확정/취소로 넘어간 회원은 절대 제외)
 *  - updatedAt(= 이 상태로 전환된 시각, 카드결제/무통장확인 시점과 동일) 로부터 24시간 경과
 *  - profile24hReminderAt 미발송(중복 방지 플래그) — 알리고 발송 성공 시에만 기록
 *    (실패 건은 마킹하지 않아 다음 실행 때 자동 재시도)
 *  - 테스트/관리자 계정 제외
 *
 * 절대 건드리지 않음: 결제/인원카운트/관리자 예약현황/마이페이지 동기화 등 기존 로직 —
 * 이 스크립트는 users/bookings 데이터를 읽고, 발송 성공한 booking에 필드 하나
 * (profile24hReminderAt)만 추가할 뿐. 다른 알림 문자(참가신청/참가확정/D-1) 로직·로그와도 완전 분리.
 *
 * 발신 환경: api/auth/sms-config.php (apikey/userid/sender) — 기존 SMS 발송 파일들과 동일 소스.
 * (참고: 프로젝트 루트 .env는 Next.js 빌드 타임 전용이라 PHP가 읽지 않음 — 기존 관례 그대로 유지)
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("cli only\n");
}

require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../_profile_notify_sms.php'; // _profileNotifyIsTestAccount() 재사용

$dataDir = dataDir();

function _p24Log(string $status, string $detail): void {
    global $dataDir;
    @file_put_contents(
        $dataDir . '/_profile_24h_reminder.log',
        sprintf("[%s] %s %s\n", date('c'), $status, $detail),
        FILE_APPEND
    );
}

$cutoff = time() - 86400; // 24시간 전 (절대 시각 비교 — updatedAt 의 타임존 표기와 무관하게 안전)

// 발신 설정 — 1회 로드
$cfgPath = __DIR__ . '/../auth/sms-config.php';
if (!file_exists($cfgPath)) {
    _p24Log('error', 'sms-config.php missing — 배치 중단');
    fwrite(STDERR, "sms-config.php 없음\n");
    exit(1);
}
$cfg = require $cfgPath;

$pdo   = getDB();
$stmt  = $pdo->query("SELECT email, name, phone, role FROM users WHERE status = 'active'");
$users = $stmt->fetchAll();

$sentCount = 0; $failCount = 0; $skipCount = 0;

foreach ($users as $u) {
    $email = (string)($u['email'] ?? '');
    if ($email === '') continue;

    $bf = $dataDir . '/bookings_' . md5(strtolower(trim($email))) . '.json';
    if (!file_exists($bf)) continue;
    $bookings = json_decode((string)file_get_contents($bf), true);
    if (!is_array($bookings)) continue;

    $fileChanged = false;

    foreach ($bookings as &$b) {
        if (!is_array($b)) continue;
        if ((string)($b['status'] ?? '') !== 'paid_pending_profile') continue;
        if (!empty($b['profile24hReminderAt'])) continue; // 이미 발송됨 — 중복 발송 차단

        $updatedAtTs = strtotime((string)($b['updatedAt'] ?? ''));
        if ($updatedAtTs === false || $updatedAtTs > $cutoff) continue; // 아직 24시간 안 지남

        try {
            $role = (string)($u['role'] ?? '');
            if (_profileNotifyIsTestAccount($email, $role)) {
                $skipCount++;
                _p24Log('skip', "test/admin account email={$email} bookingId=" . ($b['id'] ?? '?'));
                continue;
            }

            $name  = (string)($u['name'] ?? '');
            $phone = preg_replace('/\D+/', '', (string)($u['phone'] ?? ''));
            if ($phone === '' || strlen($phone) < 10 || !str_starts_with($phone, '01')) {
                $skipCount++;
                _p24Log('skip', "invalid phone email={$email} bookingId=" . ($b['id'] ?? '?'));
                continue;
            }

            $msg =
                "{$name}님, [어울림] 프로필 작성 안내\n" .
                "만족도 높은 매칭을 위해 프로필 작성을 완성해주세요. [어울림] 홈페이지의 마이페이지에서 프로필 작성을 완성해주셔야 최종 참가 검토가 진행됩니다. (※ 미작성 시 참가가 제한되거나 참가확정이 지연될 수 있습니다.)";

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

            if ($resCode === '1') {
                $b['profile24hReminderAt'] = date('c');
                $fileChanged = true;
                $sentCount++;
                _p24Log('sent', sprintf(
                    'email=%s bookingId=%s phone=%s type=%s',
                    $email, $b['id'] ?? '?', $phone, $msgType
                ));
            } else {
                $failCount++;
                _p24Log('fail', sprintf(
                    'email=%s bookingId=%s phone=%s type=%s http=%d code=%s msg=%s err=%s',
                    $email, $b['id'] ?? '?', $phone, $msgType, $resHttp, $resCode,
                    substr((string)($resJson['message'] ?? ''), 0, 80),
                    substr((string)$resErr, 0, 80)
                ));
            }
        } catch (Throwable $e) {
            $failCount++;
            _p24Log('exception', "email={$email} bookingId=" . ($b['id'] ?? '?') . ' ' . substr($e->getMessage(), 0, 120));
        }
    }
    unset($b);

    if ($fileChanged) {
        file_put_contents($bf, json_encode($bookings, JSON_UNESCAPED_UNICODE));
    }
}

$summary = "24h 리마인드 완료 — 발송={$sentCount} 실패={$failCount} 스킵={$skipCount}";
_p24Log('done', $summary);
echo $summary . "\n";
