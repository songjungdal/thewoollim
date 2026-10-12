<?php
/**
 * 관리자 메인이미지(히어로) 설정.
 *
 * GET  → { ok: true, config: {...hero.json...}, parties: [ { partyId, title, dateString, calendarDate, location, imageUrl,
 *                                                       maleLeft, femaleLeft, open, almostFull, ended } ] }
 *        parties = 모든 파티의 모집 상태(날짜순) — "파티 추가" 목록(모집중만)과 선택된 파티의 상태 배지, 미리보기 계산에 쓴다.
 * POST { config } → { ok: true, config }  — parties 가 3개를 넘으면 거절.
 *
 * 저장: api/data/hero.json (규칙·기본값은 api/_hero.php)
 */

declare(strict_types=1);
require_once __DIR__ . '/../_hero.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

$file = dataDir() . '/hero.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $infos = array_map(function (array $i) { unset($i['eventTs']); return $i; }, heroPartyInfos());
    jsonOut(['ok' => true, 'config' => heroConfigLoad(), 'parties' => $infos]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body = jsonBody();
if (!is_array($body['config'] ?? null)) jsonFail('config 가 필요합니다.');
try {
    $cfg = heroSanitizeConfig($body['config'], true);
} catch (RuntimeException $e) {
    jsonFail($e->getMessage());
}

$tmp = $file . '.tmp';
if (@file_put_contents($tmp, json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX) === false
    || !@rename($tmp, $file)) {
    @unlink($tmp);
    jsonFail('저장에 실패했습니다.', 500);
}

logAdminActivity('update', 'image', 'hero',
    '메인이미지 저장 — 파티 슬라이드 ' . count($cfg['parties']) . '개, 자동 채우기 ' . ($cfg['autoFill'] ? '켬' : '끔'),
    null, ['parties' => array_column($cfg['parties'], 'partyId'), 'autoFill' => $cfg['autoFill']]);

jsonOut(['ok' => true, 'config' => $cfg]);
