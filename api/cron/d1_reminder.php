<?php
/**
 * D-1(파티 하루 전) 참가확정 회원 리마인드 알림 문자 — 알리고.
 *
 * 실행: 서버 crontab 전용 CLI 스크립트. 실결제 계정에 실제 SMS 비용이 발생하는 배치라
 * 공개 HTTP 엔드포인트로 노출하지 않고 CLI 실행만 허용함.
 *   예) 0 1 * * *  php /var/www/thewoollim/api/cron/d1_reminder.php   (매일 01:00 UTC = 10:00 KST)
 *
 * 흐름:
 *  1) '내일'(Asia/Seoul 기준) calendarDate 와 일치하는 파티 전부 조회
 *  2) 전체 회원(users) 순회 → 각자의 bookings_<md5(email)>.json 에서
 *     status==='confirmed' && partyId ∈ 대상파티 && 미발송(d1NotifiedAt 없음) 인 건만 추출
 *  3) 테스트/관리자 계정·연락처 없는 계정은 건너뜀
 *  4) 알리고 발송 성공(result_code==='1') 시에만 해당 booking에 d1NotifiedAt 기록
 *     → 같은 날 재실행돼도 이미 보낸 건은 다시 발송하지 않음 (실패 건은 마킹하지 않아 재실행 시 자동 재시도)
 *  5) 수신자 1건의 실패/예외가 전체 배치를 막지 않도록 개별 try/catch, 실패는 로그만 남김
 *
 * 절대 건드리지 않음: 결제/인원카운트/투표/마이페이지 동기화 등 기존 로직 — 이 스크립트는
 * users/parties/bookings 데이터를 읽고, 발송 성공한 booking에 필드 하나(d1NotifiedAt)만 추가할 뿐.
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

$dataDir = dataDir();

function _d1Log(string $status, string $detail): void {
    global $dataDir;
    @file_put_contents(
        $dataDir . '/_d1_reminder.log',
        sprintf("[%s] %s %s\n", date('c'), $status, $detail),
        FILE_APPEND
    );
}

/** 발송 제외 대상(테스트/관리자) 이메일 — 소문자 비교 */
function _d1IsTestAccount(string $email, string $role): bool {
    $email = strtolower(trim($email));
    if ($role === 'admin') return true;                       // 관리자 role 제외
    if (str_ends_with($email, '@woollim.local')) return true;  // 관리자 계정 도메인 제외
    // 테스트 계정 패턴: a1~a10@naver.com, b1~b10@naver.com
    if (preg_match('/^[ab](?:[1-9]|10)@naver\.com$/', $email)) return true;
    return false;
}

/** dateString('2026년 05월 29일 (금) 19:00') → ['date'=>'2026년 05월 29일 (금)', 'time'=>'19:00'] */
function _d1SplitDate(string $dateString): array {
    $time = '';
    if (preg_match('/(\d{1,2}:\d{2})/', $dateString, $m)) $time = $m[1];
    $date = $time !== '' ? trim(str_replace($time, '', $dateString)) : trim($dateString);
    return ['date' => $date, 'time' => $time];
}

// 1) '내일' 날짜 (Asia/Seoul 기준, YYYY-MM-DD) — 서버 OS 타임존과 무관하게 KST 고정 계산
$tomorrow = (new DateTime('now', new DateTimeZone('Asia/Seoul')))
    ->modify('+1 day')->format('Y-m-d');

// 2) 내일 열리는 파티 조회
$parties = json_decode((string)@file_get_contents($dataDir . '/parties.json'), true);
if (!is_array($parties)) $parties = [];
$targetParties = []; // partyId => party
foreach ($parties as $p) {
    if (!is_array($p)) continue;
    if ((string)($p['calendarDate'] ?? '') === $tomorrow) {
        $targetParties[(string)($p['id'] ?? '')] = $p;
    }
}

if (empty($targetParties)) {
    $msg = "내일({$tomorrow}) 예정 파티 없음 — 발송 대상 0건";
    _d1Log('done', $msg);
    echo $msg . "\n";
    exit(0);
}

// 3) 발신 설정 — 1회 로드
$cfgPath = __DIR__ . '/../auth/sms-config.php';
if (!file_exists($cfgPath)) {
    _d1Log('error', 'sms-config.php missing — 배치 중단');
    fwrite(STDERR, "sms-config.php 없음\n");
    exit(1);
}
$cfg = require $cfgPath;

// 4) 전체 회원 순회 — 각자의 bookings 파일에서 내일 파티의 confirmed 건만 추출
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
        if ((string)($b['status'] ?? '') !== 'confirmed') continue;
        $partyId = (string)($b['partyId'] ?? '');
        if (!isset($targetParties[$partyId])) continue;
        if (!empty($b['d1NotifiedAt'])) continue; // 이미 발송됨 — 중복 발송 차단

        try {
            $role = (string)($u['role'] ?? '');
            if (_d1IsTestAccount($email, $role)) {
                $skipCount++;
                _d1Log('skip', "test/admin account email={$email} bookingId=" . ($b['id'] ?? '?'));
                continue;
            }

            $name  = (string)($u['name'] ?? '');
            $phone = preg_replace('/\D+/', '', (string)($u['phone'] ?? ''));
            if ($phone === '' || strlen($phone) < 10 || !str_starts_with($phone, '01')) {
                $skipCount++;
                _d1Log('skip', "invalid phone email={$email} bookingId=" . ($b['id'] ?? '?'));
                continue;
            }

            $party = $targetParties[$partyId];
            $title = (string)($party['title']    ?? '');
            $loc   = (string)($party['location'] ?? '');
            $dt    = _d1SplitDate((string)($party['dateString'] ?? ''));
            $pdate = $dt['date'] !== '' ? $dt['date'] : '추후 안내';
            $ptime = $dt['time'] !== '' ? $dt['time'] : '추후 안내';

            $msg =
                "{$name}님, 내일은 설레는 만남이 있는 매칭파티 날입니다!\n\n" .
                "{$title}\n" .
                "일시: {$pdate}\n" .
                "시간: {$ptime}\n" .
                "장소: {$loc}\n\n" .
                "현장 본인 확인을 위해 신분증을 반드시 지참해 주시고, 늦지 않게 10분 전까지 도착해 주세요.";

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
            if ($msgType === 'LMS') $params['title'] = '[어울림] 매칭파티 D-Day 안내';

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
                $b['d1NotifiedAt'] = date('c');
                $fileChanged = true;
                $sentCount++;
                _d1Log('sent', sprintf(
                    'email=%s bookingId=%s partyId=%s phone=%s type=%s',
                    $email, $b['id'] ?? '?', $partyId, $phone, $msgType
                ));
            } else {
                $failCount++;
                _d1Log('fail', sprintf(
                    'email=%s bookingId=%s partyId=%s phone=%s type=%s http=%d code=%s msg=%s err=%s',
                    $email, $b['id'] ?? '?', $partyId, $phone, $msgType, $resHttp, $resCode,
                    substr((string)($resJson['message'] ?? ''), 0, 80),
                    substr((string)$resErr, 0, 80)
                ));
            }
        } catch (Throwable $e) {
            $failCount++;
            _d1Log('exception', "email={$email} bookingId=" . ($b['id'] ?? '?') . ' ' . substr($e->getMessage(), 0, 120));
        }
    }
    unset($b);

    if ($fileChanged) {
        file_put_contents($bf, json_encode($bookings, JSON_UNESCAPED_UNICODE));
    }
}

$summary = "D-1 리마인드 완료 — 대상일={$tomorrow} 발송={$sentCount} 실패={$failCount} 스킵={$skipCount}";
_d1Log('done', $summary);
echo $summary . "\n";
