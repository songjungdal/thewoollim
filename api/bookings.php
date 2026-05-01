<?php
/**
 * 회원 본인 예약 목록 조회 (마이페이지).
 *
 * GET ?email=<x> → Booking[]
 *   { id, partyId, status, paymentId?, total?, createdAt, updatedAt }
 *
 * 본인 데이터만 — email 파라미터가 세션 이메일과 일치해야 함.
 *
 * 예약 데이터는 /api/data/bookings_<md5(email)>.json 파일 단위로 저장.
 *  - 결제 성공 시 payments/success.php 가 추가
 *  - 회원/관리자 취소 시 status='cancelled' 로 표시 (삭제 X)
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);

$email = normalizeEmail((string)($_GET['email'] ?? ''));
if ($email === '') jsonOut([]);
requireUser($email);

$file = dataDir() . '/bookings_' . md5($email) . '.json';
if (!file_exists($file)) jsonOut([]);

$d = json_decode((string)file_get_contents($file), true);
if (!is_array($d)) jsonOut([]);

// 최신순 정렬
usort($d, fn($a, $b) => strcmp((string)($b['createdAt'] ?? ''), (string)($a['createdAt'] ?? '')));

// 정규화 — 응답에 노출할 필드만 (Booking 타입 from AuthContext)
$out = [];
foreach ($d as $b) {
    if (!is_array($b)) continue;
    $out[] = [
        'id'        => (string)($b['id']         ?? ''),
        'partyId'   => (string)($b['partyId']    ?? ''),
        'status'    => (string)($b['status']     ?? ''),
        'paymentId' => $b['paymentId'] ?? null,
        'total'     => isset($b['total']) ? (int)$b['total'] : 0,
        'createdAt' => (string)($b['createdAt']  ?? ''),
        'updatedAt' => (string)($b['updatedAt']  ?? ''),
    ];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
