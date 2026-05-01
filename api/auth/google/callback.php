<?php
/**
 * Google OAuth 콜백.
 * GET ?code=<auth_code>&state=<csrf>
 */

declare(strict_types=1);
require_once __DIR__ . '/../_session.php';
require_once __DIR__ . '/../oauth-helper.php';

$code  = (string)($_GET['code']  ?? '');
$state = (string)($_GET['state'] ?? '');
$err   = (string)($_GET['error'] ?? '');

if ($err !== '') oauthFail('구글 인증이 취소되었습니다.');
if ($code === '') oauthFail('인증 코드가 없습니다.');
if ($state === '' || !hash_equals((string)($_SESSION['oauthState'] ?? ''), $state)) {
    oauthFail('잘못된 인증 응답입니다.');
}
if (($_SESSION['oauthProvider'] ?? '') !== 'google') oauthFail('OAuth 공급자 불일치.');

try {
    $cfg = loadOAuthConfig()['google'];
    $tok = oauthExchangeToken('https://oauth2.googleapis.com/token', [
        'grant_type'    => 'authorization_code',
        'client_id'     => $cfg['client_id'],
        'client_secret' => $cfg['client_secret'],
        'redirect_uri'  => $cfg['redirect_uri'],
        'code'          => $code,
    ]);
    $profile = oauthFetchProfile('google', (string)$tok['access_token']);
    $user    = oauthLoginOrCreate('google', $profile);

    loginUserSession((int)$user['id'], (string)$user['email']);
    unset($_SESSION['oauthState'], $_SESSION['oauthProvider'], $_SESSION['oauthStartedAt']);

    oauthRedirect('https://thewoollim.com/');
} catch (Throwable $e) {
    error_log('[google/callback] ' . $e->getMessage());
    oauthFail('구글 로그인 중 오류가 발생했습니다.');
}
