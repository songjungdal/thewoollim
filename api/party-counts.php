<?php
/**
 * 파티별 실시간 결제완료 인원 조회 (공개).
 *
 * GET → { "<partyId>": { "male": N, "female": N, "sessions"?: { "<회차id>": { "male": N, "female": N } } }, ... }
 *   sessions: 참가 구성이 있는 솔로파티의 회차별 인원 (1부+2부 신청자는 두 회차에 각각 1명)
 *
 * 데이터 소스: /api/data/party_counts.json
 *  - 결제완료(payments/success.php) 시점에만 atomic 증가
 *  - 관리자 강제 취소(admin/bookings.php cancel) 시 atomic 감소
 *  - 시드/하드코딩 fallback 없음 — 신규 파티는 자동으로 0/0 으로 표시
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonFail('method not allowed', 405);
}

$file = dataDir() . '/party_counts.json';
if (!file_exists($file)) {
    echo json_encode((object)[]); // 빈 객체 (배열 [] 가 아님)
    exit;
}

$raw = file_get_contents($file);
$d = json_decode((string)$raw, true);
if (!is_array($d) || empty($d)) {
    echo json_encode((object)[]);
    exit;
}

// 클라이언트가 기대하는 정확한 형식으로 정규화
$out = [];
foreach ($d as $pid => $row) {
    if (!is_array($row)) continue;
    $out[(string)$pid] = [
        'male'   => (int)($row['male']   ?? 0),
        'female' => (int)($row['female'] ?? 0),
    ];
    if (!empty($row['sessions']) && is_array($row['sessions'])) {
        $ss = [];
        foreach ($row['sessions'] as $sid => $c) {
            if (is_array($c)) $ss[(string)$sid] = ['male' => (int)($c['male'] ?? 0), 'female' => (int)($c['female'] ?? 0)];
        }
        $out[(string)$pid]['sessions'] = (object)$ss;
    }
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
