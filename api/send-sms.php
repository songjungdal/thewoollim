<?php
/**
 * SMS 인증번호 발송 (Aligo).
 *
 * POST { phone: "01012345678" } → { ok: true, cooldown: 60 }
 *  - phone 은 숫자만 (10~11자리, 01 시작)
 *  - 동일 번호 60초 내 재발송 차단 (rate limit)
 *  - 6자리 코드 생성 → /api/data/sms_<md5(phone)>.json 저장
 *  - Aligo API 호출
 *
 * 실패: { ok: false, error: string, cooldown?: number }
 *
 * 보안:
 *  - 인증번호 평문 저장 (3분 만료) — 일반적인 OTP 패턴
 *  - 일일 발송 한도 (per-phone 일 10회) — abuse 방지
 *  - Aligo 응답 result_code != "1" 인 경우 실패로 간주
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body  = jsonBody();
$phone = preg_replace('/\D+/', '', (string)($body['phone'] ?? ''));
if ($phone === '' || strlen($phone) < 10 || strlen($phone) > 11 || !str_starts_with($phone, '01')) {
    jsonFail('올바른 휴대폰 번호를 입력해주세요.');
}

$dir  = dataDir();
$file = $dir . '/sms_' . md5($phone) . '.json';
$now  = time();

// rate limit 검사
if (file_exists($file)) {
    $prev = json_decode((string)file_get_contents($file), true);
    if (is_array($prev)) {
        $lastSent = (int)($prev['sentAt'] ?? 0);
        $cooldown = 60 - ($now - $lastSent);
        if ($cooldown > 0) {
            jsonOut([
                'ok'       => false,
                'error'    => '잠시 후 다시 시도해주세요.',
                'cooldown' => $cooldown,
            ]);
        }
        // 일일 10회 한도
        $today = date('Ymd', $now);
        $sentToday = (int)(($prev['dailyCount'] ?? 0));
        $sentDay   = (string)($prev['dailyDate'] ?? '');
        if ($sentDay === $today && $sentToday >= 10) {
            jsonFail('일일 발송 한도(10회)를 초과했습니다.', 429);
        }
    }
}

// 인증번호 생성
$code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);

// Aligo 발송
$cfgPath = __DIR__ . '/auth/sms-config.php';
if (!file_exists($cfgPath)) {
    error_log('[send-sms] sms-config.php missing');
    jsonFail('서버 설정 오류 — 잠시 후 다시 시도해주세요.', 500);
}
$cfg = require $cfgPath;

$msg = "[어울림] 인증번호: {$code}\n타인에게 노출하지 마세요.";
$post = http_build_query([
    'key'      => $cfg['apikey'],
    'user_id'  => $cfg['userid'],
    'sender'   => preg_replace('/\D+/', '', (string)$cfg['sender']),
    'receiver' => $phone,
    'msg'      => $msg,
    'msg_type' => 'SMS',
    'testmode_yn' => 'N',
]);

$ch = curl_init('https://apis.aligo.in/send/');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $post,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
]);
$resBody = curl_exec($ch);
$resHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$resErr  = curl_error($ch);
curl_close($ch);

$resJson = is_string($resBody) ? (json_decode($resBody, true) ?: []) : [];
$resCode = (string)($resJson['result_code'] ?? '');

@file_put_contents(
    $dir . '/_sms_send.log',
    sprintf("[%s] phone=%s http=%d code=%s msg=%s err=%s\n",
        date('c'), $phone, $resHttp, $resCode,
        substr((string)($resJson['message'] ?? ''), 0, 100),
        substr((string)$resErr, 0, 100)),
    FILE_APPEND
);

if ($resCode !== '1') {
    jsonFail($resJson['message'] ?? '문자 발송에 실패했습니다.', 502);
}

// 인증번호 저장 (이전 dailyCount 누적)
$prev      = is_array($prev ?? null) ? $prev : [];
$today     = date('Ymd', $now);
$dailyDate = (string)($prev['dailyDate'] ?? '');
$dailyCnt  = ($dailyDate === $today) ? (int)($prev['dailyCount'] ?? 0) + 1 : 1;

file_put_contents($file, json_encode([
    'phone'      => $phone,
    'code'       => $code,
    'sentAt'     => $now,
    'expiresAt'  => $now + 180, // 3분
    'verified'   => false,
    'attempts'   => 0,
    'dailyDate'  => $today,
    'dailyCount' => $dailyCnt,
]));

jsonOut(['ok' => true, 'cooldown' => 60]);
