<?php
/**
 * 다날 본인인증(PortOne V2) 결과 조회 및 성인 검증.
 *
 * POST { identityVerificationId } → { ok:true, name, gender, birthDate }
 *
 * 처리:
 *  1) PortOne API Secret → accessToken 교환 (POST /login/api-secret)
 *  2) 본인인증 결과 조회 (GET /identity-verifications/{id})
 *  3) status !== 'VERIFIED' → 실패
 *  4) 만 19세 미만 → 가입 차단 (하드 게이트, 우회 불가)
 *  5) 세션에 검증된 이름/성별/생년월일 저장 (30분 유효)
 *     → register.php 가 이 값만 신뢰 (클라이언트가 보낸 값은 사용하지 않음)
 *     (SMS 인증의 verifiedPhone/verifiedPhoneAt 과 동일한 패턴)
 *
 * 연락처는 이 채널(다날 "본인인증"=CI/DI 상품)의 응답에 포함되지 않아
 * (verifiedCustomer 에 name/birthDate/gender/ci/di 만 존재) 가입 폼에서 별도 입력받는다.
 *
 * 실패: 400 / 403 / 500 + { ok:false, error }
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body                   = jsonBody();
$identityVerificationId = trim((string)($body['identityVerificationId'] ?? ''));
if ($identityVerificationId === '') jsonFail('identityVerificationId 가 필요합니다.');

$cfgPath = __DIR__ . '/portone-config.php';
if (!is_file($cfgPath)) {
    error_log('[verify-identity] portone-config.php 없음');
    jsonFail('본인인증 설정 오류입니다. 관리자에게 문의해주세요.', 500);
}
$cfg = require $cfgPath;

/** PortOne REST API 호출 공통 헬퍼 — 실패 시 null */
function portoneRequest(string $method, string $url, array $headers, ?array $body = null): ?array {
    $ch   = curl_init($url);
    $opts = [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => $headers,
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
    }
    curl_setopt_array($ch, $opts);
    $raw    = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err    = curl_error($ch);
    curl_close($ch);

    if ($raw === false || $err !== '') {
        error_log('[verify-identity] cURL 오류: ' . $err);
        return null;
    }
    $decoded = json_decode((string)$raw, true);
    if (!is_array($decoded)) {
        error_log('[verify-identity] JSON 파싱 실패: ' . substr((string)$raw, 0, 300));
        return null;
    }
    if ($status < 200 || $status >= 300) {
        error_log(sprintf('[verify-identity] HTTP %d: %s', $status, substr((string)$raw, 0, 300)));
        return null;
    }
    return $decoded;
}

// 1) API Secret → accessToken 교환
$authRes = portoneRequest(
    'POST',
    'https://api.portone.io/login/api-secret',
    ['Content-Type: application/json'],
    ['apiSecret' => (string)$cfg['apiSecret']]
);
$accessToken = (string)($authRes['accessToken'] ?? '');
if ($accessToken === '') {
    jsonFail('본인인증 서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.', 500);
}

// 2) 본인인증 결과 조회
$verifyUrl = 'https://api.portone.io/identity-verifications/'
    . rawurlencode($identityVerificationId) . '?storeId=' . rawurlencode((string)$cfg['storeId']);
$res = portoneRequest('GET', $verifyUrl, ['Authorization: Bearer ' . $accessToken]);
if ($res === null) {
    jsonFail('본인인증 결과 조회에 실패했습니다. 잠시 후 다시 시도해주세요.', 500);
}

$status = (string)($res['status'] ?? '');
if ($status !== 'VERIFIED') {
    error_log('[verify-identity] status=' . $status . ' id=' . $identityVerificationId);
    jsonFail('본인인증이 완료되지 않았습니다. 다시 시도해주세요.');
}

// 3) 검증된 고객 정보 추출 — 실 응답 확인됨: verifiedCustomer.{name,birthDate,gender,ci,di}
//    birthDate 는 이미 'YYYY-MM-DD' 형식 문자열로 내려옴 (연/월/일 분리 필드 아님).
$vc = is_array($res['verifiedCustomer'] ?? null) ? $res['verifiedCustomer'] : $res;

$rawName      = trim((string)($vc['name'] ?? ''));
$rawGender    = strtoupper((string)($vc['gender'] ?? ''));
$rawBirthDate = (string)($vc['birthDate'] ?? '');

if ($rawName === '') jsonFail('본인인증 결과에서 이름을 확인할 수 없습니다.', 500);
if ($rawGender !== 'MALE' && $rawGender !== 'FEMALE') {
    jsonFail('본인인증 결과에서 성별을 확인할 수 없습니다.', 500);
}
if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $rawBirthDate, $m)) {
    error_log('[verify-identity] birthDate 파싱 실패: ' . $rawBirthDate);
    jsonFail('본인인증 결과에서 생년월일을 확인할 수 없습니다.', 500);
}

$gender    = $rawGender === 'MALE' ? '남성' : '여성';
$birthDate = $m[1] . '-' . $m[2] . '-' . $m[3];

// 4) 성인 검증 (만 19세 이상) — 최우선 하드 게이트, 미성년자는 즉시 차단
$age = calcAgeFromBirthDate($birthDate);
if ($age < 19) {
    jsonFail('어울림 서비스는 만 19세 이상 성인만 이용 가능합니다.', 403);
}

// 5) 검증 결과를 세션에 저장 (30분 유효) — register.php 가 신뢰하는 유일한 출처
//    연락처는 이 상품 응답에 없어 세션에 넣지 않음 — register.php 에서 폼 입력값을 사용.
$_SESSION['verifiedIdentity'] = [
    'name'      => $rawName,
    'gender'    => $gender,
    'birthDate' => $birthDate,
];
$_SESSION['verifiedIdentityAt'] = time();

jsonOut([
    'ok'        => true,
    'name'      => $rawName,
    'gender'    => $gender,
    'birthDate' => $birthDate,
]);
