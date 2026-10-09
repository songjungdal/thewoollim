<?php
/**
 * [사용 중지] 예전 회원 본인 즉시 취소 + 환불 API.
 *
 * 회원 취소는 승인제(api/payments/cancel-request.php → 관리자 승인 api/admin/bookings.php)로 바뀌었다.
 * 이 파일이 예전 규칙(파티 5일 전 100%, 그 외 0%)으로 예약을 즉시 취소하지 못하도록 막아 둔다.
 * 어떤 요청이든 데이터(예약 파일, party_counts, 토스 결제)를 읽거나 쓰지 않고 410 으로 응답한다.
 *
 * 파일을 지우지 않는 이유: API 배포는 --delete 를 쓰지 않아 저장소에서 지워도 서버 파일이 남는다.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
jsonHeaders();

jsonFail('더 이상 사용하지 않는 기능입니다. 마이페이지에서 취소 요청을 해 주세요.', 410);
