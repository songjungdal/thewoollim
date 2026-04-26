-- 어울림 DB 마이그레이션
-- 001_create_users.sql — 회원 테이블 초기 생성
-- Target DB : lampdb (MariaDB 10.11 on 15.164.55.147)
-- Applied   : 2026-04-24
--
-- 적용 방법:
--   ssh admin@15.164.55.147
--   sudo mysql lampdb < 001_create_users.sql

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL                     COMMENT '로그인 아이디 (이메일)',
  password_hash VARCHAR(255) DEFAULT NULL                 COMMENT 'bcrypt 해시 (SNS-only 가입자는 NULL)',
  name          VARCHAR(100) NOT NULL                     COMMENT '실명',
  nickname      VARCHAR(50)  DEFAULT NULL                 COMMENT '닉네임',
  phone         VARCHAR(20)  NOT NULL                     COMMENT '휴대폰 번호 (숫자만)',
  sns_provider  VARCHAR(20)  DEFAULT NULL                 COMMENT 'kakao | naver | google | NULL(일반가입)',
  sns_user_id   VARCHAR(100) DEFAULT NULL                 COMMENT 'SNS 플랫폼 고유 ID',
  status        ENUM('active','withdrawn') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP                         COMMENT '가입일',
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  withdrawn_at  TIMESTAMP    NULL     DEFAULT NULL,
  UNIQUE KEY uk_email    (email),
  UNIQUE KEY uk_phone    (phone),
  UNIQUE KEY uk_nickname (nickname),
  UNIQUE KEY uk_sns      (sns_provider, sns_user_id),
  KEY idx_status  (status),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='어울림 회원 테이블';
