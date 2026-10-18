<?php
/**
 * Auto Insta 연동용 파티 현황 (읽기 전용). 명세: docs/specs/autoinsta-integration.md
 *
 * GET /api/integrations/autoinsta-parties.php?from=YYYY-MM-DD
 * Header: X-Api-Key: <연동 키>   (api/integrations/autoinsta-config.php 의 api_key)
 *
 * → { ok, generatedAt, parties: [ {id,title,partyType,dateString,calendarDate,startsAt,location,locationTag,
 *      target,minAge,maxAge,allowedMaritalStatus,targetGroup,priceMale,priceFemale,
 *      maleStock,femaleStock,maleBooked,femaleBooked,remaining{male,female},vbankPending{male,female},
 *      couponDisabled,status,url,imageUrl,sessions[],options[]} ] }
 *
 * - 남은 자리는 서버 마감 판단과 같은 함수(partyRemainingSeats · partyStockLimit · sessionStockLimit)를 그대로 쓴다.
 * - vbankPending 은 무통장 "입금 확인 중"(vbank_pending) 예약 수. 인원(maleBooked)에는 들어가지 않은 수다.
 * - api/data/*.json 은 읽기만 한다. 개인정보(이름·연락처·생년월일·예약 상세)는 내보내지 않는다.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonFail('method not allowed', 405);
}

// ─── 연동 키 확인 ──────────────────────────────────────────────────
$configFile = __DIR__ . '/autoinsta-config.php';
$config = is_file($configFile) ? require $configFile : null;
$expectedKey = is_array($config) ? (string)($config['api_key'] ?? '') : '';
if ($expectedKey === '' || $expectedKey === 'CHANGE_ME_LONG_RANDOM_STRING') {
    jsonFail('not configured', 503);
}
$givenKey = (string)($_SERVER['HTTP_X_API_KEY'] ?? '');
if ($givenKey === '' || !hash_equals($expectedKey, $givenKey)) {
    jsonFail('unauthorized', 401);
}

// ─── 기간 ─────────────────────────────────────────────────────────
$from = (string)($_GET['from'] ?? '');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
    $from = date('Y-m-d', strtotime('-7 days')); // 오늘(KST)로부터 7일 전 — lib.php 가 KST 로 고정
}

// ─── 데이터 읽기 (쓰지 않음) ────────────────────────────────────────
$dir = dataDir();
$parties = json_decode((string)@file_get_contents($dir . '/parties.json'), true);
if (!is_array($parties)) $parties = [];
$counts = json_decode((string)@file_get_contents($dir . '/party_counts.json'), true);
if (!is_array($counts)) $counts = [];

/** 무통장 입금 확인 중 예약 수 — 파티·성별별 (partyApplicantStats 와 같은 방식으로 예약 파일을 훑는다) */
function autoinstaVbankPending(): array {
    $out = [];
    foreach (glob(dataDir() . '/bookings_*.json') ?: [] as $f) {
        $list = json_decode((string)@file_get_contents($f), true);
        if (!is_array($list)) continue;
        foreach ($list as $b) {
            if (!is_array($b) || (string)($b['status'] ?? '') !== 'vbank_pending') continue;
            $pid = (string)($b['partyId'] ?? '');
            if ($pid === '') continue;
            $g = (string)($b['gender'] ?? '') === '남성' ? 'male' : 'female';
            if (!isset($out[$pid])) $out[$pid] = ['male' => 0, 'female' => 0];
            $out[$pid][$g]++;
        }
    }
    return $out;
}

/** calendarDate + dateString 의 첫 HH:MM (없으면 첫 회차 시작 시각, 그것도 없으면 00:00), +09:00 */
function autoinstaStartsAt(array $p): ?string {
    $date = (string)($p['calendarDate'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return null;
    $time = '00:00';
    if (preg_match('/(\d{1,2}):(\d{2})/', (string)($p['dateString'] ?? ''), $m)) {
        $time = str_pad($m[1], 2, '0', STR_PAD_LEFT) . ':' . $m[2];
    } elseif (is_array($p['sessions'] ?? null) && isset($p['sessions'][0]) && is_array($p['sessions'][0])
        && preg_match('/(\d{1,2}):(\d{2})/', (string)($p['sessions'][0]['startTime'] ?? ''), $m)) {
        $time = str_pad($m[1], 2, '0', STR_PAD_LEFT) . ':' . $m[2];
    }
    return $date . 'T' . $time . ':00+09:00';
}

$siteUrl = 'https://thewoollim.com';
$vbank = autoinstaVbankPending();
$result = [];

foreach ($parties as $p) {
    if (!is_array($p) || empty($p['id'])) continue;
    if ((string)($p['calendarDate'] ?? '') < $from) continue;

    $pid = (string)$p['id'];
    $countsRow = is_array($counts[$pid] ?? null) ? $counts[$pid] : ['male' => 0, 'female' => 0];
    $hasOptions = partyHasOptions($p);
    $imageUrl = $p['imageUrl'] ?? null;
    if (is_string($imageUrl) && str_starts_with($imageUrl, '/')) $imageUrl = $siteUrl . $imageUrl;

    $row = [
        'id'                   => $pid,
        'title'                => (string)($p['title'] ?? ''),
        'partyType'            => partyTypeOf($p),
        'dateString'           => (string)($p['dateString'] ?? ''),
        'calendarDate'         => (string)($p['calendarDate'] ?? ''),
        'startsAt'             => autoinstaStartsAt($p),
        'location'             => (string)($p['location'] ?? ''),
        'locationTag'          => $p['locationTag'] ?? null,
        'target'               => (string)($p['target'] ?? ''),
        'minAge'               => isset($p['minAge']) ? (int)$p['minAge'] : null,
        'maxAge'               => isset($p['maxAge']) ? (int)$p['maxAge'] : null,
        'allowedMaritalStatus' => $p['allowedMaritalStatus'] ?? null,
        'targetGroup'          => $p['targetGroup'] ?? null,
        'priceMale'            => $hasOptions ? null : priceForGender($p, '남성'),
        'priceFemale'          => $hasOptions ? null : priceForGender($p, '여성'),
        'maleStock'            => partyStockLimit($p, 'male'),
        'femaleStock'          => partyStockLimit($p, 'female'),
        'maleBooked'           => (int)($countsRow['male'] ?? 0),
        'femaleBooked'         => (int)($countsRow['female'] ?? 0),
        'remaining'            => partyRemainingSeats($p, $countsRow),
        'vbankPending'         => $vbank[$pid] ?? ['male' => 0, 'female' => 0],
        'couponDisabled'       => partyCouponDisabled($p),
        'status'               => isset($p['status']) ? (string)$p['status'] : null,
        'url'                  => $siteUrl . '/party/' . rawurlencode($pid) . '/',
        'imageUrl'             => $imageUrl,
        'sessions'             => [],
        'options'              => [],
    ];

    if ($hasOptions) {
        $row['sessions'] = array_map(function ($s) use ($countsRow) {
            $sid = (string)$s['id'];
            $mb = (int)($countsRow['sessions'][$sid]['male'] ?? 0);
            $fb = (int)($countsRow['sessions'][$sid]['female'] ?? 0);
            return [
                'id'           => $sid,
                'name'         => (string)$s['name'],
                'startTime'    => (string)$s['startTime'],
                'maleStock'    => (int)$s['maleStock'],
                'femaleStock'  => (int)$s['femaleStock'],
                'maleBooked'   => $mb,
                'femaleBooked' => $fb,
                'remaining'    => [
                    'male'   => max(0, sessionStockLimit($s, 'male') - $mb),
                    'female' => max(0, sessionStockLimit($s, 'female') - $fb),
                ],
            ];
        }, array_values(array_filter((array)$p['sessions'], 'is_array')));
        $row['options'] = array_map(fn($o) => [
            'id'          => (string)$o['id'],
            'name'        => (string)$o['name'],
            'sessionIds'  => array_values(array_map('strval', (array)($o['sessionIds'] ?? []))),
            'priceMale'   => (int)$o['priceMale'],
            'priceFemale' => (int)$o['priceFemale'],
        ], array_values(array_filter((array)$p['options'], 'is_array')));
    }

    $result[] = $row;
}

jsonOut([
    'ok'          => true,
    'generatedAt' => date('c'),
    'parties'     => $result,
]);
