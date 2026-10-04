<?php
/**
 * 아이디(이메일) 찾기 — 가입 시 등록한 휴대폰 번호로 일반 회원을 찾아 마스킹된 이메일을 반환.
 *
 * POST { phone } → 200 { ok: true, maskedEmail }
 *                  404 { ok: false, error }   일치 회원 없음
 *                  400 { ok: false, error }   번호 형식 오류
 *
 * 대상: status='active' AND role='user' (관리자 계정은 대상 아님).
 * 번호 비교는 하이픈/공백 제거 후 숫자만 비교 (구 데이터 하이픈 유무 혼재 대응).
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body   = jsonBody();
$digits = preg_replace('/\D+/', '', (string)($body['phone'] ?? ''));
if (!preg_match('/^01\d{8,9}$/', (string)$digits)) {
    jsonFail('올바른 휴대폰 번호를 입력해주세요.');
}

try {
    $stmt = getDB()->prepare("
        SELECT email FROM users
         WHERE REPLACE(REPLACE(phone,'-',''),' ','') = ?
           AND status = 'active' AND role = 'user'
         LIMIT 1
    ");
    $stmt->execute([$digits]);
    $row = $stmt->fetch();
} catch (Throwable $e) {
    error_log('[auth/find-id] DB ' . $e->getMessage());
    jsonFail('서버 오류 — 잠시 후 다시 시도해주세요.', 500);
}

if (!$row) jsonFail('일치하는 회원 정보를 찾을 수 없습니다.', 404);

$parts = explode('@', (string)$row['email'], 2);
$local = $parts[0];
$shown = substr($local, 0, min(2, strlen($local)));
$masked = $shown . str_repeat('*', max(1, strlen($local) - 2)) . (isset($parts[1]) ? '@' . $parts[1] : '');

echo json_encode(['ok' => true, 'maskedEmail' => $masked], JSON_UNESCAPED_UNICODE);
