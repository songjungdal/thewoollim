<?php
/**
 * Aligo SMS 자격증명 템플릿.
 *  - 실제 운영 자격증명은 /var/www/thewoollim/api/auth/sms-config.php 에만 존재.
 *  - 본 파일은 git 추적용 형태만. 실제 sms-config.php 는 .gitignore 처리.
 *
 * 발급/조회: https://smartsms.aligo.in/admin/api/auth.html
 *  - apikey   : 내정보 → API 인증키 (32자 영숫자)
 *  - userid   : 알리고 계정 아이디
 *  - sender   : 사전 등록된 발신번호 (하이픈 포함 OK, 송신 전 자동 정규화)
 *
 * 신규 환경 셋업:
 *   1) cp sms-config.example.php sms-config.php
 *   2) 실제 자격증명으로 교체
 *   3) sudo chmod 640 sms-config.php && sudo chown admin:www-data sms-config.php
 */
return [
    'apikey' => '<REPLACE_WITH_ALIGO_API_KEY>',
    'userid' => '<REPLACE_WITH_ALIGO_USER_ID>',
    'sender' => '<REPLACE_WITH_REGISTERED_SENDER_PHONE>',
];
