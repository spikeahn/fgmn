-- =============================================
-- FGMN 카페 운영 프로그램 초기 스키마
-- =============================================

-- 1. 직원 정보
CREATE TABLE IF NOT EXISTS staffs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  hourly_wage  INT  NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true
);

-- 2. 오픈/마감 업무 체크리스트
CREATE TABLE IF NOT EXISTS checklists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

-- 3. 체크 기록
CREATE TABLE IF NOT EXISTS checklist_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES staffs(id)     ON DELETE CASCADE,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_completed BOOLEAN NOT NULL DEFAULT false
);

-- 4. 근무표
CREATE TABLE IF NOT EXISTS schedules (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       UUID    NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
  date           DATE    NOT NULL,
  shift_type     TEXT    CHECK (shift_type IN ('오픈', '미들', '마감')),
  note           TEXT,
  recorded_hours NUMERIC NOT NULL DEFAULT 0
);

-- =============================================
-- 인덱스
-- =============================================

CREATE INDEX IF NOT EXISTS idx_checklist_logs_checklist_id ON checklist_logs(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_logs_staff_id     ON checklist_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_checklist_logs_checked_at   ON checklist_logs(checked_at);

CREATE INDEX IF NOT EXISTS idx_schedules_staff_id ON schedules(staff_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date     ON schedules(date);
