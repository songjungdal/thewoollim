<?php
/**
 * 현재 회원 세션 확인.
 *
 * GET → { ok: bool, email?: string }
 *  - AuthContext.tsx 가 마운트 시점에 호출
 *  - 응답에 email 만 노출 (프로필 상세는 /api/profile.php)
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();

if (userIsLoggedIn()) {
    jsonOut(['ok' => true, 'email' => currentUserEmail()]);
}
jsonOut(['ok' => false]);
