<?php
/**
 * 파티별 실시간 참가확정 인원 조회 (공개) — 화면의 인원 표시·남은 자리·마감 판정이 쓴다.
 *
 * GET → { "<partyId>": { "male": N, "female": N, "sessions"?: { "<회차id>": { "male": N, "female": N } } }, ... }
 *   sessions: 참가 구성이 있는 솔로파티의 회차별 인원 (1부+2부 신청자는 두 회차에 각각 1명)
 *
 * 데이터 소스: 참가확정 인원 (lib.php readConfirmedCounts → party_confirmed_counts.json)
 *  - 관리자 [참가확정](admin/bookings.php approve) 때 atomic 증가 — 결제만 끝난 예약은 세지 않는다
 *  - 관리자 취소(admin/bookings.php cancel·cancel_full_refund) 때 참가확정이었던 예약만 atomic 감소
 *  - 시드/하드코딩 fallback 없음 — 신규 파티는 자동으로 0/0 으로 표시
 *  - 결제·입금 확인 인원(party_counts.json)은 기록용으로 따로 남아 있고 여기서는 쓰지 않는다
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonFail('method not allowed', 405);
}

$d = readConfirmedCounts();
if (empty($d)) {
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
