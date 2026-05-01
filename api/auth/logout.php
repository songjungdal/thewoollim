<?php
/**
 * 회원 로그아웃 — WOOLLIM_USER 세션 파괴 + 쿠키 만료.
 *  - 관리자 세션(WOOLLIM_ADMIN)은 영향 없음 (다른 쿠키 이름)
 *  - GET / POST 둘 다 허용
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();

logoutUserSession();
jsonOut(['ok' => true]);
