<?php
/**
 * 알리고 잔여 발송 가능 건수 조회 (관리자 운영 현황 팝업용, 조회 전용).
 *
 * GET → { ok:true, sms:<int>, lms:<int>, mms:<int> }
 *
 * 알리고 공식 API(POST https://apis.aligo.in/remain/) — 기존 SMS 발송 코드들과
 * 동일한 자격증명 소스(api/auth/sms-config.php)를 그대로 사용. 아무 데이터도
 * 쓰지 않는 순수 조회이며, 다른 발송 로직에는 전혀 영향을 주지 않음.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);

$cfgPath = __DIR__ . '/../auth/sms-config.php';
if (!file_exists($cfgPath)) {
    error_log('[admin/sms-remain] sms-config.php missing');
    jsonOut(['ok' => false, 'error' => 'sms-config.php missing']);
}
$cfg = require $cfgPath;

try {
    $ch = curl_init('https://apis.aligo.in/remain/');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'key'     => $cfg['apikey'],
            'user_id' => $cfg['userid'],
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $resBody = curl_exec($ch);
    $resHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $resErr  = curl_error($ch);

    $resJson = is_string($resBody) ? (json_decode($resBody, true) ?: []) : [];
    $resCode = (int)($resJson['result_code'] ?? 0);

    if ($resHttp !== 200 || $resCode !== 1) {
        error_log(sprintf(
            '[admin/sms-remain] http=%d code=%d body=%s err=%s',
            $resHttp, $resCode, substr((string)$resBody, 0, 300), $resErr
        ));
        jsonOut(['ok' => false, 'error' => '잔여 건수 조회 실패']);
    }

    jsonOut([
        'ok'  => true,
        'sms' => (int)($resJson['SMS_CNT'] ?? 0),
        'lms' => (int)($resJson['LMS_CNT'] ?? 0),
        'mms' => (int)($resJson['MMS_CNT'] ?? 0),
    ]);
} catch (Throwable $e) {
    error_log('[admin/sms-remain] ' . $e->getMessage());
    jsonOut(['ok' => false, 'error' => '잔여 건수 조회 중 오류']);
}
