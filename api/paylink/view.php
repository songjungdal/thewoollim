<?php
/**
 * 결제 링크 화면 정보 (docs/specs/paylink.md 4-1). 로그인 없이 링크 코드로만 연다.
 * GET ?t=<32자 링크 코드>
 *  → 결제 대기: { ok, status:'open', title, amount, useDate, useInfo, expiresAt, notice, refundPolicy:[{when,rate,label}], payerName }
 *  → 결제 완료·취소: { ok, status, title, amount, paidAt, receiptUrl, cancelledAmount }
 *  → 기한 지남·중지: { ok, status }
 *  → 없는 링크: 404 { ok:false, status:'not_found' }
 * 결제자 연락처·다른 링크 정보·관리자 메모는 내보내지 않는다.
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
jsonHeaders();
header('X-Robots-Tag: noindex, nofollow');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);

$link = paylinkFindByToken(trim((string)($_GET['t'] ?? '')));
if ($link === null) jsonFail('잘못된 결제 링크입니다.', 404, ['status' => 'not_found']);
jsonOut(paylinkPublicView($link));
