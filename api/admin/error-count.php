<?php
/**
 * 관리자 대시보드 팝업용 — 오늘 발생한 시스템 에러 건수. v7.0 (집계 전용 + 확인 처리)
 *
 * GET                  → { ok:true, count:<int> }
 * POST { action:'ack' } → { ok:true, count:<int> }  — 팝업 [확인] 버튼. 지금까지 기록된 에러를 확인 처리
 *
 * 기존 결제/카운트 처리에서 기록하는 실패 로그 파일들의 '오늘자' 라인 수를 합산.
 * 확인 처리한 시각(_error_ack.json 의 ackedAt) 이전에 찍힌 줄은 세지 않는다 — 모든 관리자·PC 공통.
 * 로그 파일과 어떤 기존 로직도 수정하지 않는다.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();

if (!adminIsLoggedIn()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'unauthorized']);
    exit;
}

$dir     = dataDir();
$ackFile = $dir . '/_error_ack.json';

/** 확인 처리 시각(unix) — 기록이 없거나 읽을 수 없으면 0 (전부 센다) */
function errorAckTime(string $ackFile): int {
    if (!is_file($ackFile)) return 0;
    $ack = json_decode((string)@file_get_contents($ackFile), true);
    $ts  = is_array($ack) ? strtotime((string)($ack['ackedAt'] ?? '')) : false;
    return $ts === false ? 0 : $ts;
}

function countTodayErrors(string $dir, int $ackTs): int {
    $today = date('Y-m-d');

    // 시스템/결제 실패 계열 로그 파일 (각 라인은 "[ISO8601] ..." 형식 → 오늘 날짜 prefix 매칭)
    $logFiles = [
        '_toss_failures.log',
        '_toss_amount_mismatch.log',
        '_counts_failure_alert.log',
    ];

    $count = 0;
    foreach ($logFiles as $lf) {
        $path = $dir . '/' . $lf;
        if (!is_file($path)) continue;
        $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) continue;
        foreach ($lines as $line) {
            if (strpos($line, $today) === false) continue;
            // 확인 처리 이전에 찍힌 줄은 제외 (줄 맨 앞 시각 기준. 시각을 못 읽으면 기존처럼 센다)
            if ($ackTs > 0 && preg_match('/^\[([^\]]+)\]/', $line, $m)) {
                $ts = strtotime($m[1]);
                if ($ts !== false && $ts <= $ackTs) continue;
            }
            $count++;
        }
    }
    return $count;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = jsonBody();
    if ((string)($body['action'] ?? '') !== 'ack') jsonFail('unknown action');

    $before = countTodayErrors($dir, errorAckTime($ackFile));
    $now    = date('c');
    try {
        withFileLock($ackFile, fn(array $cur) => [
            'ackedAt' => $now,
            'adminId' => (string)($_SESSION['adminId'] ?? '?'),
        ]);
    } catch (Throwable $e) {
        error_log('[admin/error-count ack] ' . $e->getMessage());
        jsonFail('확인 처리를 저장하지 못했습니다.', 500);
    }
    logAdminActivity('update', 'system', 'error-count', "시스템 에러 {$before}건 확인 처리", ['count' => $before], ['ackedAt' => $now]);
    jsonOut(['ok' => true, 'count' => countTodayErrors($dir, errorAckTime($ackFile))]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);

jsonOut(['ok' => true, 'count' => countTodayErrors($dir, errorAckTime($ackFile))]);
