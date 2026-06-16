<?php
/**
 * 관리자 대시보드 팝업용 — 오늘 발생한 시스템 에러 건수. v7.0 (read-only, 추가 전용)
 *
 * GET → { ok:true, count:<int> }
 *
 * 기존 결제/카운트 처리에서 기록하는 실패 로그 파일들의 '오늘자' 라인 수를 합산.
 * 어떤 기존 로직도 수정하지 않으며, 단순 집계만 수행.
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

$dir   = __DIR__ . '/../data';
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
        if (strpos($line, $today) !== false) $count++;
    }
}

jsonOut(['ok' => true, 'count' => $count]);
