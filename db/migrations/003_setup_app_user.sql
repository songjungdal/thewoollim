-- 003_setup_app_user.sql — PHP 앱 전용 DB 계정 생성 (최소 권한)
-- Applied: 2026-04-24
--
-- 실제 비밀번호는 서버의 /var/www/thewoollim/api/db-config.php 에만 저장되어 있음 (chmod 640).
-- 다른 환경에서 재현 시 openssl rand -base64 24 로 새로 생성하고 이 파일의 <REPLACE_ME>도 갱신.

CREATE USER IF NOT EXISTS 'woollim_app'@'localhost' IDENTIFIED BY '<REPLACE_ME>';
GRANT SELECT, INSERT, UPDATE ON lampdb.users TO 'woollim_app'@'localhost';
FLUSH PRIVILEGES;

-- 관리자 계정 시드 (bcrypt 해시는 php -r 'echo password_hash("비밀번호", PASSWORD_BCRYPT);' 로 생성)
INSERT INTO users (email, password_hash, name, phone, status)
VALUES ('pletora@naver.com', '<BCRYPT_HASH>', '어울림관리자', '01067503722', 'active')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);
