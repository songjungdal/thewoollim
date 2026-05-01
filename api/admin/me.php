<?php
/**
 * 관리자 세션 확인.
 * GET → { ok: bool, id?: string }
 */
declare(strict_types=1);
require_once __DIR__ . '/_session.php';
adminJsonHeaders();

echo json_encode([
    'ok' => adminIsLoggedIn(),
    'id' => $_SESSION['adminId'] ?? null,
]);
