<?php
/**
 * 매칭파티 목록 조회 (공개).
 *
 * GET → [{id,title,dateString,calendarDate,location,target,price,tag,
 *        maleStock,femaleStock,maleBooked,femaleBooked,
 *        minAge?,maxAge?,allowedMaritalStatus?,
 *        imageUrl?,description?,
 *        targetGroup?,theme?,locationTag?,partyType,
 *        sessions?:[{id,name,startTime,maleStock,femaleStock,maleBooked,femaleBooked}],
 *        options?:[{id,name,sessionIds,priceMale,priceFemale}]}]
 *   sessions·options: 참가 구성이 있는 솔로파티만 (docs/specs/party-options-solo.md). 회차별 신청 인원은 party_counts 의 sessions.
 *
 * 데이터 소스: /api/data/parties.json (관리자 폼이 편집)
 * - 파일이 비어있거나 손상 시 빈 배열 반환 (UI 측 fallback 처리)
 * - maleBooked/femaleBooked 는 party_counts.json 의 실시간 값으로 합성
 *   → 관리자 단일 진실 소스(parties.json)를 변경하지 않고 표시 값만 결합
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonFail('method not allowed', 405);
}

$dir = dataDir();
$partiesFile = $dir . '/parties.json';
$countsFile  = $dir . '/party_counts.json';

$parties = [];
if (file_exists($partiesFile)) {
    $raw = file_get_contents($partiesFile);
    $d = json_decode((string)$raw, true);
    if (is_array($d)) $parties = $d;
}

// 인원 카운트 합성
$counts = [];
if (file_exists($countsFile)) {
    $raw = file_get_contents($countsFile);
    $c = json_decode((string)$raw, true);
    if (is_array($c)) $counts = $c;
}

$result = [];
foreach ($parties as $p) {
    if (!is_array($p) || empty($p['id'])) continue;
    $pid = (string)$p['id'];
    $cur = $counts[$pid] ?? ['male' => 0, 'female' => 0];

    $result[] = [
        'id'                   => $pid,
        'title'                => (string)($p['title']        ?? ''),
        'dateString'           => (string)($p['dateString']   ?? ''),
        'calendarDate'         => (string)($p['calendarDate'] ?? ''),
        'location'             => (string)($p['location']     ?? ''),
        'target'               => (string)($p['target']       ?? ''),
        'price'                => (int)   ($p['price']        ?? 0),
        'priceMale'            => isset($p['priceMale'])   ? (int)$p['priceMale']   : null,
        'priceFemale'          => isset($p['priceFemale']) ? (int)$p['priceFemale'] : null,
        'tag'                  => (string)($p['tag']          ?? '주제별'),
        'maleStock'            => (int)   ($p['maleStock']    ?? 12),
        'femaleStock'          => (int)   ($p['femaleStock']  ?? 12),
        'maleBooked'           => (int)   ($cur['male']       ?? 0),
        'femaleBooked'         => (int)   ($cur['female']     ?? 0),
        'minAge'               => isset($p['minAge'])   ? (int)$p['minAge']   : null,
        'maxAge'               => isset($p['maxAge'])   ? (int)$p['maxAge']   : null,
        'allowedMaritalStatus' => $p['allowedMaritalStatus'] ?? null,
        'imageUrl'             => $p['imageUrl']    ?? null,
        'description'          => $p['description'] ?? null,
        'targetGroup'          => $p['targetGroup'] ?? null,
        'theme'                => $p['theme']       ?? null,
        'locationTag'          => $p['locationTag'] ?? null,
        // 파티 종류 — 상세페이지 안내(detail)는 10초 폴링 응답을 키우지 않도록 넣지 않는다 (/api/party-detail.php 로 따로 조회)
        'partyType'            => partyTypeOf($p),
    ];
    // 참가 구성 (솔로파티) — 회차(이름·시작 시각·정원·신청 인원)와 항목(이름·포함 회차·남/여 가격)
    if (partyHasOptions($p)) {
        $row = &$result[count($result) - 1];
        $row['sessions'] = array_map(fn($s) => [
            'id'           => (string)$s['id'],
            'name'         => (string)$s['name'],
            'startTime'    => (string)$s['startTime'],
            'maleStock'    => (int)$s['maleStock'],
            'femaleStock'  => (int)$s['femaleStock'],
            'maleBooked'   => (int)($cur['sessions'][(string)$s['id']]['male']   ?? 0),
            'femaleBooked' => (int)($cur['sessions'][(string)$s['id']]['female'] ?? 0),
        ], array_values($p['sessions']));
        $row['options'] = array_map(fn($o) => [
            'id'          => (string)$o['id'],
            'name'        => (string)$o['name'],
            'sessionIds'  => array_values(array_map('strval', (array)$o['sessionIds'])),
            'priceMale'   => (int)$o['priceMale'],
            'priceFemale' => (int)$o['priceFemale'],
        ], array_values($p['options']));
        unset($row);
    }
}

echo json_encode($result, JSON_UNESCAPED_UNICODE);
