<?php
/**
 * DB 자격증명 템플릿.
 *  - 실제 운영 자격증명은 /var/www/thewoollim/api/db-config.php 에만 존재 (chmod 640).
 *  - 본 파일은 git 추적용 형태만 보존. 실제 db-config.php 는 .gitignore 처리.
 *
 * 신규 환경 셋업:
 *   1) cp db-config.example.php db-config.php
 *   2) 'pass' 값을 실제 woollim_app 비밀번호로 교체
 *   3) chmod 640 + chown admin:www-data
 */
return [
    'host'    => 'localhost',
    'name'    => 'lampdb',
    'user'    => 'woollim_app',
    'pass'    => '<REPLACE_WITH_ACTUAL_PASSWORD>',
    'charset' => 'utf8mb4',
];
