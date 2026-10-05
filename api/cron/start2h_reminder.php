<?php
/**
 * 매칭파티 시작 2시간 전 참가확정 회원 최종 안내 문자 — 알리고.
 *
 * 실행: 서버 systemd 타이머(start2h-reminder.timer, 5분 간격) 전용 CLI 스크립트.
 * 실제 SMS 비용이 발생하는 배치라 공개 HTTP 엔드포인트로 노출하지 않고 CLI 실행만 허용함.
 *
 * 흐름:
 *  1) 현재(Asia/Seoul) 시각이 '파티 시작 2시간 전 ~ 그 후 10분' 구간인 파티만 대상 (calendarDate + dateString 시각)
 *  2) 대상 파티의 status==='confirmed' 예약 중 start2hNotifiedAt 이 없는 건만 발송
 *  3) 발송 성공(result_code==='1') 시에만 해당 booking 에 start2hNotifiedAt 기록 → 같은 구간 재실행돼도 중복 발송 없음
 *  4) 테스트/관리자 계정·연락처 없는 계정은 건너뜀. 수신자 1건의 실패/예외가 전체 배치를 막지 않도록 개별 try/catch
 *
 * 대상 구간 밖에서는 아무것도 하지 않고 조용히 종료한다 (5분마다 실행되어도 로그가 쌓이지 않음).
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("cli only\n");
}

require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';

$dataDir = dataDir();

function _s2hLog(string $status, string $detail): void {
    global $dataDir;
    @file_put_contents(
        $dataDir . '/_start2h_reminder.log',
        sprintf("[%s] %s %s\n", date('c'), $status, $detail),
        FILE_APPEND
    );
}

/** 발송 제외 대상(테스트/관리자) — 기존 SMS 배치와 동일 규칙 */
function _s2hIsTestAccount(string $email, string $role): bool {
    $email = strtolower(trim($email));
    if ($role === 'admin') return true;
    if (str_ends_with($email, '@woollim.local')) return true;
    if (preg_match('/^[ab](?:[1-9]|10)@naver\.com$/', $email)) return true;
    return false;
}

/** calendarDate('2026-10-04') + dateString('2026. 10. 4 (일) 17:00') → 파티 시작 시각 (KST). 정보 부족 시 null */
function _s2hPartyStart(array $party): ?DateTimeImmutable {
    $date = (string)($party['calendarDate'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return null;
    if (!preg_match('/(\d{1,2}):(\d{2})/', (string)($party['dateString'] ?? ''), $m)) return null;
    $time = sprintf('%02d:%s:00', (int)$m[1], $m[2]);
    $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', "{$date} {$time}", new DateTimeZone('Asia/Seoul'));
    return $dt ?: null;
}

/** dateString('2026. 10. 4 (일) 17:00') → ['date'=>'2026. 10. 4 (일)', 'time'=>'17:00'] */
function _s2hSplitDate(string $dateString): array {
    $time = '';
    if (preg_match('/(\d{1,2}:\d{2})/', $dateString, $m)) $time = $m[1];
    $date = $time !== '' ? trim(str_replace($time, '', $dateString)) : trim($dateString);
    return ['date' => $date, 'time' => $time];
}

// 1) 지금 발송 구간(시작 2시간 전 ~ +10분)에 있는 파티
$now = new DateTimeImmutable('now', new DateTimeZone('Asia/Seoul'));
$parties = json_decode((string)@file_get_contents($dataDir . '/parties.json'), true);
if (!is_array($parties)) $parties = [];

$targets = []; // partyId => ['party' => array, 'startAt' => DateTimeImmutable]
foreach ($parties as $p) {
    if (!is_array($p)) continue;
    $startAt = _s2hPartyStart($p);
    if ($startAt === null) continue;
    $remindAt = $startAt->modify('-2 hours');
    if ($now >= $remindAt && $now < $remindAt->modify('+10 minutes')) {
        $targets[(string)($p['id'] ?? '')] = ['party' => $p, 'startAt' => $startAt];
    }
}

if (empty($targets)) exit(0);

// 2) 발신 설정
$cfgPath = __DIR__ . '/../auth/sms-config.php';
if (!file_exists($cfgPath)) {
    _s2hLog('error', 'sms-config.php missing — 배치 중단');
    fwrite(STDERR, "sms-config.php 없음\n");
    exit(1);
}
$cfg = require $cfgPath;

// 3) 회원별 예약 순회
$pdo   = getDB();
$users = $pdo->query("SELECT email, name, phone, role FROM users WHERE status = 'active'")->fetchAll();

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
        if (!isset($targets[$partyId])) continue;
        if (!empty($b['start2hNotifiedAt'])) continue;

        try {
            $role = (string)($u['role'] ?? '');
            if (_s2hIsTestAccount($email, $role)) {
                $skipCount++;
                _s2hLog('skip', "test/admin account email={$email} bookingId=" . ($b['id'] ?? '?'));
                continue;
            }

            $name  = (string)($u['name'] ?? '');
            $phone = preg_replace('/\D+/', '', (string)($u['phone'] ?? ''));
            if ($phone === '' || strlen($phone) < 10 || !str_starts_with($phone, '01')) {
                $skipCount++;
                _s2hLog('skip', "invalid phone email={$email} bookingId=" . ($b['id'] ?? '?'));
                continue;
            }

            $party = $targets[$partyId]['party'];
            $title = (string)($party['title']    ?? '');
            $loc   = (string)($party['location'] ?? '');
            $dt    = _s2hSplitDate((string)($party['dateString'] ?? ''));
            $pdate = $dt['date'] !== '' ? $dt['date'] : '추후 안내';
            $ptime = $dt['time'] !== '' ? $dt['time'] : '추후 안내';

            $msg =
                "[어울림] 파티 시작 2시간 전 최종 안내\n" .
                "안녕하세요, {$name}님!\n" .
                "2시간 뒤 {$title}이 시작됩니다. 원활하고 편안한 진행을 위해 아래 안내사항을 꼭 확인해 주세요.\n" .
                "{$pdate} {$ptime}\n" .
                "{$loc}\n\n" .
                "[참석 전 필수 체크사항]\n" .
                "- 시작 20분 전부터 라운지 입장이 가능합니다. 일찍 도착하셔서 차 한잔하시며 분위기에 미리 적응해 보세요.\n" .
                "- 파티 시작 10분 이후부터는 입장이 절대 불가능합니다. 여유 있게 10분 전까지 도착해주세요.\n" .
                "- 파티 장소 주변 주차 공간이 협소하오니 가급적 대중교통 이용을 부탁드립니다.\n" .
                "설레는 마음으로 기다리고 있겠습니다. 오시는 길 조심히 오세요!";

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
            if ($msgType === 'LMS') $params['title'] = '[어울림] 파티 시작 2시간 전 최종 안내';

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
                $b['start2hNotifiedAt'] = date('c');
                $fileChanged = true;
                $sentCount++;
                _s2hLog('sent', sprintf(
                    'email=%s bookingId=%s partyId=%s phone=%s type=%s',
                    $email, $b['id'] ?? '?', $partyId, $phone, $msgType
                ));
            } else {
                $failCount++;
                _s2hLog('fail', sprintf(
                    'email=%s bookingId=%s partyId=%s phone=%s type=%s http=%d code=%s msg=%s err=%s',
                    $email, $b['id'] ?? '?', $partyId, $phone, $msgType, $resHttp, $resCode,
                    substr((string)($resJson['message'] ?? ''), 0, 80),
                    substr((string)$resErr, 0, 80)
                ));
            }
        } catch (Throwable $e) {
            $failCount++;
            _s2hLog('exception', "email={$email} bookingId=" . ($b['id'] ?? '?') . ' ' . substr($e->getMessage(), 0, 120));
        }
    }
    unset($b);

    if ($fileChanged) {
        file_put_contents($bf, json_encode($bookings, JSON_UNESCAPED_UNICODE));
    }
}

_s2hLog('done', sprintf('파티=%s 발송=%d 실패=%d 스킵=%d', implode(',', array_keys($targets)), $sentCount, $failCount, $skipCount));
