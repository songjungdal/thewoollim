<?php
/**
 * 메인 히어로(롤링 슬라이드) 공통 함수 — api/hero.php(공개), api/admin/hero.php(관리자)가 함께 쓴다.
 *
 * 설정 파일: api/data/hero.json
 *   { brand: { imagePc, imageMo, focusPc, focusMo, tonePc, toneMo, toneModePc, toneModeMo },
 *     parties: [ { partyId, imagePc?, imageMo?, focusPc?, focusMo?, tonePc?, toneMo?, toneModePc?, toneModeMo? } ],  // 최대 3개, 순서 = 노출 순서
 *     autoFill: true }
 *   파일이 없거나 손상되면 기본값(브랜드 이미지 /images/hero-bg.webp, 톤 dark, parties [], autoFill true).
 *
 * 슬라이드 규칙 (화면 쪽 같은 규칙: app/lib/hero.ts buildHeroSlides — 관리자 미리보기)
 *   1) 브랜드 1장
 *   2) 관리자가 고른 파티 중 모집중인 것만 순서대로
 *   3) 3개 미만이고 autoFill 이면 날짜가 가까운 모집중 파티로 채움(중복 제외)
 *   모집중 = 행사 일시 전 && (남 잔여 > 0 || 여 잔여 > 0), 마감임박 = 남·여 잔여 합계 3 이하
 *   전용 이미지가 없으면 imagePc/imageMo = null, fallbackImage = 파티 대표 이미지, 톤 dark
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';

const HERO_MAX_PARTIES = 3;
const HERO_DEFAULT_IMAGE = '/images/hero-bg.webp';
const HERO_FALLBACK_PARTY_IMAGE = '/images/party_card_default_banner.jpg';

function heroDefaultConfig(): array {
    return [
        'brand' => [
            'imagePc' => HERO_DEFAULT_IMAGE, 'imageMo' => HERO_DEFAULT_IMAGE,
            'focusPc' => '50% 30%', 'focusMo' => '50% 0%',
            'tonePc' => 'dark', 'toneMo' => 'dark', 'toneModePc' => 'dark', 'toneModeMo' => 'dark',
        ],
        'parties'  => [],
        'autoFill' => true,
    ];
}

// 이미지 경로 — 메인이미지 업로드(/uploads/hero/)와 사이트 기본 이미지(/images/)만 허용
function heroImagePath($v): ?string {
    if (!is_string($v) || $v === '') return null;
    if (strlen($v) > 300 || str_contains($v, '..')) return null;
    return preg_match('#^/(uploads/hero|images)/[A-Za-z0-9._/-]+\.(webp|jpe?g|png)$#i', $v) ? $v : null;
}

function heroFocus($v, string $fallback): string {
    if (is_string($v) && preg_match('/^(\d{1,3})% (\d{1,3})%$/', $v, $m) && (int)$m[1] <= 100 && (int)$m[2] <= 100) return $v;
    return $fallback;
}

function heroTone($v, string $fallback = 'dark'): string {
    return in_array($v, ['light', 'dark'], true) ? $v : $fallback;
}

function heroToneMode($v, string $fallback): string {
    return in_array($v, ['auto', 'light', 'dark'], true) ? $v : $fallback;
}

/** 이미지·초점·톤 한 벌 정리 ($optional = 파티 슬라이드처럼 이미지를 비워도 되는 경우) */
function heroSanitizeImageSet(array $in, array $defaults, bool $optional): array {
    $out = [
        'imagePc' => heroImagePath($in['imagePc'] ?? null),
        'imageMo' => heroImagePath($in['imageMo'] ?? null),
        'focusPc' => heroFocus($in['focusPc'] ?? null, $defaults['focusPc']),
        'focusMo' => heroFocus($in['focusMo'] ?? null, $defaults['focusMo']),
        'tonePc'  => heroTone($in['tonePc'] ?? null),
        'toneMo'  => heroTone($in['toneMo'] ?? null),
    ];
    $out['toneModePc'] = heroToneMode($in['toneModePc'] ?? null, $out['tonePc']);
    $out['toneModeMo'] = heroToneMode($in['toneModeMo'] ?? null, $out['toneMo']);
    if (!$optional) {
        $out['imagePc'] = $out['imagePc'] ?? $out['imageMo'] ?? HERO_DEFAULT_IMAGE;
        $out['imageMo'] = $out['imageMo'] ?? $out['imagePc'];
    }
    return $out;
}

/** 설정 정리 — parties 가 3개를 넘으면 $strict 일 때 거절(RuntimeException), 아니면 앞 3개만 */
function heroSanitizeConfig($cfg, bool $strict = false): array {
    $def = heroDefaultConfig();
    if (!is_array($cfg)) return $def;
    $brandIn = is_array($cfg['brand'] ?? null) ? $cfg['brand'] : [];
    $out = [
        'brand'    => heroSanitizeImageSet($brandIn, $def['brand'], false),
        'parties'  => [],
        'autoFill' => array_key_exists('autoFill', $cfg) ? filter_var($cfg['autoFill'], FILTER_VALIDATE_BOOLEAN) : true,
    ];
    $list = is_array($cfg['parties'] ?? null) ? array_values($cfg['parties']) : [];
    if ($strict && count($list) > HERO_MAX_PARTIES) {
        throw new RuntimeException('파티 슬라이드는 최대 ' . HERO_MAX_PARTIES . '개까지 고를 수 있습니다.');
    }
    $seen = [];
    foreach ($list as $p) {
        if (!is_array($p)) continue;
        $pid = trim((string)($p['partyId'] ?? ''));
        if ($pid === '' || isset($seen[$pid]) || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $pid)) continue;
        $seen[$pid] = true;
        $out['parties'][] = ['partyId' => $pid] + heroSanitizeImageSet($p, ['focusPc' => '50% 50%', 'focusMo' => '50% 0%'], true);
        if (count($out['parties']) >= HERO_MAX_PARTIES) break;
    }
    return $out;
}

function heroConfigLoad(): array {
    $raw = @file_get_contents(dataDir() . '/hero.json');
    $cfg = $raw !== false ? json_decode($raw, true) : null;
    return heroSanitizeConfig($cfg);
}

/** 행사 일시(타임스탬프) — 일시 문자열의 HH:MM, 없으면 그날 23:59:59 (화면 partyEventDate 와 같은 규칙) */
function heroPartyEventTs(array $p): int {
    $cd = (string)($p['calendarDate'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $cd)) return 0;
    if (preg_match('/(\d{1,2}):(\d{2})/', (string)($p['dateString'] ?? ''), $m)) {
        return (int)strtotime(sprintf('%s %02d:%s:00', $cd, (int)$m[1], $m[2]));
    }
    return (int)strtotime($cd . ' 23:59:59');
}

/** 파티별 모집 상태 — parties.json + party_counts.json (공개 api/parties.php 와 같은 합성) */
function heroPartyInfos(): array {
    $dir = dataDir();
    $parties = json_decode((string)@file_get_contents($dir . '/parties.json'), true);
    $counts  = json_decode((string)@file_get_contents($dir . '/party_counts.json'), true);
    if (!is_array($parties)) $parties = [];
    if (!is_array($counts))  $counts  = [];
    $now = time();
    $out = [];
    foreach ($parties as $p) {
        if (!is_array($p) || empty($p['id'])) continue;
        $pid  = (string)$p['id'];
        $left = partyRemainingSeats($p, is_array($counts[$pid] ?? null) ? $counts[$pid] : []);
        $ts   = heroPartyEventTs($p);
        $ended = $ts <= $now || (($p['status'] ?? '') === 'completed');
        $open  = !$ended && ($left['male'] > 0 || $left['female'] > 0);
        $img   = (string)($p['imageUrl'] ?? '');
        $out[] = [
            'partyId'      => $pid,
            'title'        => (string)($p['title'] ?? ''),
            'dateString'   => (string)($p['dateString'] ?? ''),
            'calendarDate' => (string)($p['calendarDate'] ?? ''),
            'location'     => (string)($p['location'] ?? ''),
            'imageUrl'     => $img !== '' ? $img : null,
            'maleLeft'     => $left['male'],
            'femaleLeft'   => $left['female'],
            'open'         => $open,
            'almostFull'   => $open && ($left['male'] + $left['female']) <= 3,
            'ended'        => $ended,
            'eventTs'      => $ts,
        ];
    }
    usort($out, fn($a, $b) => $a['eventTs'] <=> $b['eventTs']);
    return $out;
}

/** 최종 슬라이드 배열 */
function heroBuildSlides(array $cfg, array $infos): array {
    $b = $cfg['brand'];
    $slides = [[
        'type' => 'brand',
        'imagePc' => $b['imagePc'], 'imageMo' => $b['imageMo'],
        'focusPc' => $b['focusPc'], 'focusMo' => $b['focusMo'],
        'tonePc'  => $b['tonePc'],  'toneMo'  => $b['toneMo'],
    ]];
    $byId = [];
    foreach ($infos as $i) $byId[$i['partyId']] = $i;

    $picked = []; // partyId => 설정(null = 자동 채움)
    foreach ($cfg['parties'] as $pc) {
        $info = $byId[$pc['partyId']] ?? null;
        if ($info && $info['open'] && !isset($picked[$info['partyId']])) $picked[$info['partyId']] = $pc;
        if (count($picked) >= HERO_MAX_PARTIES) break;
    }
    if ($cfg['autoFill'] && count($picked) < HERO_MAX_PARTIES) {
        foreach ($infos as $info) { // 날짜순 정렬됨
            if (count($picked) >= HERO_MAX_PARTIES) break;
            if ($info['open'] && !array_key_exists($info['partyId'], $picked)) $picked[$info['partyId']] = null;
        }
    }
    foreach ($picked as $pid => $pc) {
        $info = $byId[(string)$pid];
        $own  = is_array($pc) && ($pc['imagePc'] !== null || $pc['imageMo'] !== null);
        $slides[] = [
            'type'          => 'party',
            'partyId'       => $info['partyId'],
            'title'         => $info['title'],
            'dateString'    => $info['dateString'],
            'location'      => $info['location'],
            'maleLeft'      => $info['maleLeft'],
            'femaleLeft'    => $info['femaleLeft'],
            'almostFull'    => $info['almostFull'],
            'href'          => '/party/' . rawurlencode($info['partyId']),
            'imagePc'       => $own ? ($pc['imagePc'] ?? $pc['imageMo']) : null,
            'imageMo'       => $own ? ($pc['imageMo'] ?? $pc['imagePc']) : null,
            'focusPc'       => is_array($pc) ? $pc['focusPc'] : '50% 50%',
            'focusMo'       => is_array($pc) ? $pc['focusMo'] : '50% 0%',
            'tonePc'        => $own ? $pc['tonePc'] : 'dark',
            'toneMo'        => $own ? $pc['toneMo'] : 'dark',
            'fallbackImage' => $info['imageUrl'] ?? HERO_FALLBACK_PARTY_IMAGE,
        ];
    }
    return $slides;
}
