<?php
/**
 * SMS 인증번호 확인.
 *
 * POST { phone, code } → { ok: true }
 *  - phone : 숫자만 (send-sms 와 동일)
 *  - code  : 6자리 숫자
 *
 * 검증 로직:
 *  1) sms_<hash>.json 존재 확인
 *  2) 만료 확인 (3분)
 *  3) 시도 횟수 (5회 초과 시 무효화)
 *  4) 코드 비교 (hash_equals — 타이밍 공격 방지)
 *  5) 성공 시 verified=true, 회원 세션에 verifiedPhone 30분 유효 마킹 → register.php 가 사용
 *
 * 실패: { ok: false, error: string }
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body  = jsonBody();
$phone = preg_replace('/\D+/', '', (string)($body['phone'] ?? ''));
$code  = preg_replace('/\D+/', '', (string)($body['code']  ?? ''));

if (!preg_match('/^01\d{8,9}$/', $phone)) jsonFail('잘못된 휴대폰 번호입니다.');
if (!preg_match('/^\d{6}$/',     $code))  jsonFail('6자리 인증번호를 입력해주세요.');

$file = dataDir() . '/sms_' . md5($phone) . '.json';
if (!file_exists($file)) jsonFail('인증번호를 먼저 발송해주세요.');

$rec = json_decode((string)file_get_contents($file), true);
if (!is_array($rec)) jsonFail('인증 데이터 손상 — 인증번호를 다시 발송해주세요.');

$now = time();
if ((int)($rec['expiresAt'] ?? 0) < $now) {
    jsonFail('인증번호가 만료되었습니다. 다시 발송해주세요.');
}

$attempts = (int)($rec['attempts'] ?? 0);
if ($attempts >= 5) {
    jsonFail('인증 시도 횟수를 초과했습니다. 다시 발송해주세요.');
}

$rec['attempts'] = $attempts + 1;
file_put_contents($file, json_encode($rec));

if (!hash_equals((string)$rec['code'], $code)) {
    jsonFail('인증번호가 일치하지 않습니다.');
}

// 성공
$rec['verified']   = true;
$rec['verifiedAt'] = $now;
file_put_contents($file, json_encode($rec));

// 세션에 마킹 — register.php 가 30분 이내인지 확인
$_SESSION['verifiedPhone']   = $phone;
$_SESSION['verifiedPhoneAt'] = $now;

jsonOut(['ok' => true]);
