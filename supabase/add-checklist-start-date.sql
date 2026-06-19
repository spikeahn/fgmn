-- 체크리스트 항목에 start_date 컬럼 추가
-- 신규 추가된 항목은 추가일 이후 날짜에만 표시됨
-- NULL = 기존 항목 (모든 날짜에 표시, 하위 호환)

ALTER TABLE checklists ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT NULL;
