<?php
/**
 * OAuth 자격증명 템플릿 (Kakao / Naver / Google).
 *  - 실제 키는 /var/www/thewoollim/api/auth/oauth-config.php (chmod 640).
 *  - Redirect URI 는 각 플랫폼 콘솔에 등록된 값과 정확히 일치해야 함.
 *
 * 자격증명 발급 위치:
 *   Kakao : https://developers.kakao.com/  → 내 애플리케이션 → 앱 키
 *   Naver : https://developers.naver.com/  → 내 애플리케이션
 *   Google: https://console.cloud.google.com/apis/credentials → OAuth 2.0 Client IDs
 */
return [
    'kakao' => [
        'client_id'     => '<KAKAO_REST_API_KEY>',
        'client_secret' => '',
        'redirect_uri'  => 'https://thewoollim.com/api/auth/kakao/callback',
    ],
    'naver' => [
        'client_id'     => '<NAVER_CLIENT_ID>',
        'client_secret' => '<NAVER_CLIENT_SECRET>',
        'redirect_uri'  => 'https://thewoollim.com/api/auth/naver/callback',
    ],
    'google' => [
        'client_id'     => '<GOOGLE_CLIENT_ID>',
        'client_secret' => '<GOOGLE_CLIENT_SECRET>',
        'redirect_uri'  => 'https://thewoollim.com/api/auth/google/callback',
    ],
];
