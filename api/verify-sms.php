<?php
/**
 * [사용 중지] 예전 회원가입 휴대폰 인증번호 확인 API.
 *
 * 인증번호 발송(api/send-sms.php)과 함께 사용을 멈췄다. 회원가입 본인 확인은 다날 본인인증
 * (api/auth/verify-identity.php → 세션 verifiedIdentity)으로 하고, 이 API 가 남기던 세션 값(verifiedPhone)은 어디서도 쓰지 않는다.
 * 어떤 요청이든 세션·파일을 건드리지 않고 410 으로 응답한다.
 *
 * 파일을 지우지 않는 이유: API 배포는 --delete 를 쓰지 않아 저장소에서 지워도 서버 파일이 남는다.
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
jsonHeaders();

jsonFail('사용하지 않는 기능입니다.', 410);
