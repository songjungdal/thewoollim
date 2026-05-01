<?php
/**
 * Kakao OAuth 콜백.
 * GET ?code=<auth_code>&state=<csrf>
 *
 * 흐름:
 *  1) state 검증 (oauth.php 가 세션에 저장)
 *  2) code → access_token (kauth.kakao.com/oauth/token)
 *  3) access_token → 프로필 (kapi.kakao.com/v2/user/me)
 *  4) 회원 매칭/생성 (oauth-helper.oauthLoginOrCreate)
 *  5) WOOLLIM_USER 세션 발급 → /  (신규/미완료 핵심5종 회원은 메인에서 /onboarding 자동 이동)
 */

declare(strict_types=1);
require_once __DIR__ . '/../_session.php';
require_once __DIR__ . '/../oauth-helper.php';

$code  = (string)($_GET['code']  ?? '');
$state = (string)($_GET['state'] ?? '');
$err   = (string)($_GET['error'] ?? '');

if ($err !== '') oauthFail('카카오 인증이 취소되었습니다.');
if ($code === '') oauthFail('인증 코드가 없습니다.');
if ($state === '' || !hash_equals((string)($_SESSION['oauthState'] ?? ''), $state)) {
    oauthFail('잘못된 인증 응답입니다.');
}
if (($_SESSION['oauthProvider'] ?? '') !== 'kakao') oauthFail('OAuth 공급자 불일치.');

try {
    $cfg = loadOAuthConfig()['kakao'];
    $tok = oauthExchangeToken('https://kauth.kakao.com/oauth/token', [
        'grant_type'   => 'authorization_code',
        'client_id'    => $cfg['client_id'],
        'redirect_uri' => $cfg['redirect_uri'],
        'code'         => $code,
    ]);
    $profile = oauthFetchProfile('kakao', (string)$tok['access_token']);
    $user    = oauthLoginOrCreate('kakao', $profile);

    loginUserSession((int)$user['id'], (string)$user['email']);
    unset($_SESSION['oauthState'], $_SESSION['oauthProvider'], $_SESSION['oauthStartedAt']);

    oauthRedirect('https://thewoollim.com/');
} catch (Throwable $e) {
    error_log('[kakao/callback] ' . $e->getMessage());
    oauthFail('카카오 로그인 중 오류가 발생했습니다.');
}
