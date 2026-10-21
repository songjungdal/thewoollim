<?php
/**
 * 토스페이먼츠 자동결제(빌링) 자격증명 템플릿 — 어울림 멤버십 전용.
 *  - 실제 파일: 서버의 api/payments/toss-billing-config.php (이 템플릿을 복사해 값만 채운다, chmod 640)
 *  - 저장소에 커밋하지 않는다(.gitignore). 배포 때 덮어쓰이지 않는다(scripts/deploy/api.rsync-filter 의 *-config.php 보호).
 *  - 일반 결제 키(api/payments/toss-config.php)와 섞어 쓰지 않는다. 같은 키를 넣으면 멤버십 결제가 "준비 중"으로 막힌다.
 *  - 값이 비었거나 형식이 맞지 않으면 /membership/ 은 "준비 중"으로 보이고 결제를 시작하지 않는다.
 *
 * TOSS_BILLING_CLIENT_KEY : 자동결제 MID 의 "API 개별 연동" 클라이언트 키 (test_ck_… / live_ck_…). 결제위젯 키(gck)는 쓸 수 없다.
 * TOSS_BILLING_SECRET_KEY : 같은 MID 의 시크릿 키 (test_sk_… / live_sk_…). 서버에서만 쓴다.
 * TOSS_BILLING_MODE       : test | live. test 는 test_ 키만, live 는 live_ 키만 받는다.
 * TOSS_BILLING_ENC_KEY    : 빌링키 암호화 키. 32바이트 난수를 base64 로 적는다.
 *                           만드는 법: openssl rand -base64 32
 *                           한 번 정한 뒤 바꾸면 이미 저장된 빌링키를 풀 수 없다.
 */
return [
    'TOSS_BILLING_CLIENT_KEY' => '',
    'TOSS_BILLING_SECRET_KEY' => '',
    'TOSS_BILLING_MODE'       => 'test',
    'TOSS_BILLING_ENC_KEY'    => '',
];
