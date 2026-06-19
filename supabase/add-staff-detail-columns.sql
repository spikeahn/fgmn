-- 직원 상세 정보 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE staffs
  ADD COLUMN IF NOT EXISTS color_index           INTEGER,
  ADD COLUMN IF NOT EXISTS visa_expiry_date      DATE,
  ADD COLUMN IF NOT EXISTS foreign_reg_number    TEXT,
  ADD COLUMN IF NOT EXISTS bank_account          TEXT,
  ADD COLUMN IF NOT EXISTS health_certificate    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hire_date             DATE,
  ADD COLUMN IF NOT EXISTS resignation_date      DATE,
  ADD COLUMN IF NOT EXISTS phone                 TEXT;
