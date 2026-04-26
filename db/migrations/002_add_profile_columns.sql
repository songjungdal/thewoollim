-- 002_add_profile_columns.sql — users 테이블에 확장 프로필 컬럼 추가
-- Applied: 2026-04-24

ALTER TABLE users
  ADD COLUMN gender     VARCHAR(10)  DEFAULT NULL COMMENT '남성|여성'                    AFTER nickname,
  ADD COLUMN location   VARCHAR(100) DEFAULT NULL COMMENT '거주 지역 (시/도 시/군/구)'  AFTER gender,
  ADD COLUMN job        VARCHAR(100) DEFAULT NULL COMMENT '직업'                          AFTER location,
  ADD COLUMN mbti       VARCHAR(4)   DEFAULT NULL COMMENT 'MBTI 성격유형'                 AFTER job,
  ADD COLUMN interests  TEXT         DEFAULT NULL COMMENT '관심사 (자유 텍스트)'          AFTER mbti,
  ADD COLUMN ideal_type TEXT         DEFAULT NULL COMMENT '이상형 (자유 텍스트)'          AFTER interests;
