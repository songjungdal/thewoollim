<?php
/**
 * Toss Payments 자격증명 템플릿.
 *  - 실제 키는 /var/www/thewoollim/api/payments/toss-config.php (chmod 640).
 *  - 발급: https://developers.tosspayments.com/  → 결제 → API 키
 *
 * 테스트 키 prefix: test_ck_ / test_sk_  (실제 결제 발생 안 함)
 * 운영 키 prefix:   live_ck_ / live_sk_  (실제 결제, 정산 시작)
 */
return [
    'client_key' => '<TOSS_CLIENT_KEY>',
    'secret_key' => '<TOSS_SECRET_KEY>',
    'confirm_url'=> 'https://api.tosspayments.com/v1/payments/confirm',
];
