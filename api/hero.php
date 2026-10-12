<?php
/**
 * 메인 히어로 슬라이드 (공개).
 *
 * GET → { ok: true, slides: [ { type: "brand", imagePc, imageMo, focusPc, focusMo, tonePc, toneMo },
 *                             { type: "party", partyId, title, dateString, location, maleLeft, femaleLeft, almostFull,
 *                               href, imagePc, imageMo, focusPc, focusMo, tonePc, toneMo, fallbackImage } ... ] }
 *   slide[0] 은 항상 브랜드, 이후 모집중 파티 최대 3개. 규칙은 api/_hero.php 참고.
 *   설정(api/data/hero.json)이 없거나 손상되어도 기본 브랜드 1장(+ 자동 채움 파티)을 돌려준다.
 */

declare(strict_types=1);
require_once __DIR__ . '/_hero.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);

try {
    $slides = heroBuildSlides(heroConfigLoad(), heroPartyInfos());
} catch (Throwable $e) {
    error_log('[hero] ' . $e->getMessage());
    $slides = heroBuildSlides(heroDefaultConfig(), []);
}

jsonOut(['ok' => true, 'slides' => $slides]);
