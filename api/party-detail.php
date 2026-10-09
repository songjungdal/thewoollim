<?php
/**
 * 파티 상세페이지 안내 조회 (공개).
 *
 * GET ?id=N → { ok: true, partyType: 'matching'|'solo', detail: {...} | null }
 *   - detail 이 없으면 null — 화면은 종류별 기본 내용(app/lib/partyDetailTemplates.ts)으로 그린다.
 *   - 목록 API(/api/parties.php)는 10초마다 다시 불러오므로 detail 을 넣지 않고 이 API 로 따로 조회한다.
 *   - 파티가 없으면 404 { ok: false }.
 *
 * 데이터 소스: /api/data/parties.json (관리자 저장 시 lib.php sanitizePartyDetail 로 검증된 값)
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonFail('method not allowed', 405);
}

$id = trim((string)($_GET['id'] ?? ''));
if (!preg_match('/^[0-9]{1,9}$/', $id)) jsonFail('파티 번호가 올바르지 않습니다.', 400);

$parties = json_decode((string)@file_get_contents(dataDir() . '/parties.json'), true);
foreach ((array)$parties as $p) {
    if (is_array($p) && (string)($p['id'] ?? '') === $id) {
        jsonOut([
            'ok'        => true,
            'partyType' => partyTypeOf($p),
            'detail'    => is_array($p['detail'] ?? null) ? $p['detail'] : null,
        ]);
    }
}
jsonFail('파티를 찾을 수 없습니다.', 404);
