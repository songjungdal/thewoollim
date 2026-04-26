-- 004_add_birth_date.sql — 생년월일 컬럼 추가
-- Applied: 2026-04-26

ALTER TABLE users
  ADD COLUMN birth_date DATE DEFAULT NULL COMMENT '생년월일 (YYYY-MM-DD)' AFTER mbti;
