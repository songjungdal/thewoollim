<?php
/**
 * SNS OAuth 진입점.
 *
 * GET ?provider=<kakao|naver|google>&action=start
 *  → state 세션 저장 + 공급자 인증 페이지로 redirect
 *
 * 콜백은 각 공급자별 callback.php (/api/auth/<provider>/callback.php) 가 처리.
 * Redirect URI 는 /api/auth/<provider>/callback (확장자 없는 형태) — .htaccess 가 .php 로 rewrite.
 */

declare(strict_types=1);
require_once __DIR__ . '/_session.php';
require_once __DIR__ . '/oauth-helper.php';

$provider = preg_replace('/[^a-z]/', '', (string)($_GET['provider'] ?? ''));
$action   = (string)($_GET['action'] ?? '');

if (!in_array($provider, ['kakao', 'naver', 'google'], true) || $action !== 'start') {
    oauthFail('잘못된 OAuth 요청입니다.');
}

try {
    $cfg = loadOAuthConfig()[$provider] ?? null;
    if (!$cfg) oauthFail('OAuth 설정이 누락되었습니다.');

    $state = bin2hex(random_bytes(16));
    $_SESSION['oauthState']     = $state;
    $_SESSION['oauthProvider']  = $provider;
    $_SESSION['oauthStartedAt'] = time();

    switch ($provider) {
        case 'kakao':
            $url = 'https://kauth.kakao.com/oauth/authorize?' . http_build_query([
                'response_type' => 'code',
                'client_id'     => $cfg['client_id'],
                'redirect_uri'  => $cfg['redirect_uri'],
                'state'         => $state,
                'scope'         => 'account_email profile_nickname',
            ]);
            break;
        case 'naver':
            $url = 'https://nid.naver.com/oauth2.0/authorize?' . http_build_query([
                'response_type' => 'code',
                'client_id'     => $cfg['client_id'],
                'redirect_uri'  => $cfg['redirect_uri'],
                'state'         => $state,
            ]);
            break;
        case 'google':
            $url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
                'response_type' => 'code',
                'client_id'     => $cfg['client_id'],
                'redirect_uri'  => $cfg['redirect_uri'],
                'state'         => $state,
                'scope'         => 'openid email profile',
                'access_type'   => 'online',
                'prompt'        => 'select_account',
            ]);
            break;
    }
    oauthRedirect($url);
} catch (Throwable $e) {
    oauthFail('OAuth 시작 중 오류가 발생했습니다.');
}
