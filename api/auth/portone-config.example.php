<?php
/**
 * PortOne V2 본인인증(다날) 자격증명 템플릿.
 *  - 실제 키는 /var/www/thewoollim/api/auth/portone-config.php (chmod 640).
 *  - 본 파일은 git 추적용 형태만. 실제 portone-config.php 는 .gitignore 처리.
 *
 * 발급/조회: https://admin.portone.io/ → 연동 정보 → 식별코드·API Keys → V2 API
 *  - storeId    : V2 API → Store ID
 *  - apiSecret  : V2 API → API Secret (본인인증 채널) — 최초 발급 시에만 전체 노출, 이후 재확인 불가
 *  - channelKey : 채널 관리 → 본인인증 채널의 채널 키
 *
 * 다날 CPID/PWD 는 앱 코드에서 직접 쓰지 않음 — 포트원 콘솔의 채널 설정(PG Provider: danal)에
 * 이미 등록되어 있어야 하며, 이 앱은 channelKey 로만 해당 채널을 지정한다.
 *
 * 신규 환경 셋업:
 *   1) cp portone-config.example.php portone-config.php
 *   2) 실제 자격증명으로 교체
 *   3) sudo chmod 640 portone-config.php && sudo chown admin:www-data portone-config.php
 */
return [
    'storeId'    => '<REPLACE_WITH_PORTONE_STORE_ID>',
    'apiSecret'  => '<REPLACE_WITH_PORTONE_V2_API_SECRET>',
    'channelKey' => '<REPLACE_WITH_IDENTITY_VERIFICATION_CHANNEL_KEY>',
];
