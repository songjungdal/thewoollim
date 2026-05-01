<?php
/**
 * 현재 회원 세션 확인.
 *
 * GET → { ok: bool, email?, role?, name? }
 *  - AuthContext.tsx 가 마운트 시점에 호출
 *  - role 은 마이페이지 인사말 분기 등에 사용 ('user' | 'admin')
 *  - 본 엔드포인트로 admin 세션이 발급되는 경로는 없으나(/api/auth/login.php 가 차단),
 *    DB 조회 결과를 그대로 노출 — 정합성 우선
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();

if (!userIsLoggedIn()) {
    jsonOut(['ok' => false]);
}

$email = currentUserEmail();
$role  = 'user';
$name  = '';

try {
    $pdo  = getDB();
    $stmt = $pdo->prepare("SELECT role, name FROM users WHERE email = ? AND status='active' LIMIT 1");
    $stmt->execute([$email]);
    $row = $stmt->fetch();
    if ($row) {
        $role = (string)($row['role'] ?? 'user');
        $name = (string)($row['name'] ?? '');
    }
} catch (Throwable $e) {
    error_log('[auth/me] ' . $e->getMessage());
    // role/name 가 없어도 ok=true 는 유지 — 클라이언트가 fallback
}

jsonOut(['ok' => true, 'email' => $email, 'role' => $role, 'name' => $name]);
