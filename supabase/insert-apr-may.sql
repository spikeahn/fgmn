-- 4월, 5월 더미 스케줄 데이터
-- 주차 규칙: 목요일이 속한 달 = 그 주의 달
--   4월 1주 = 3/30(월)~4/5(일)  → 3/30, 3/31 포함 필요
--   4월 5주 = 4/27(월)~5/3(일)  → 5/1~5/3 포함
--   5월 1주 = 5/4(월)~5/10(일)
-- 따라서 3/30부터 5/31까지 커버

-- 기존 6월 데이터는 건드리지 않음
DELETE FROM schedules WHERE date >= '2026-03-30' AND date <= '2026-05-31';

INSERT INTO schedules (staff_id, date, shift_type, start_time, end_time, recorded_hours)
WITH dates AS (
  SELECT
    d::date                                   AS dt,
    (d::date - '2026-03-30'::date)::int       AS n,    -- 0-based 날짜 인덱스
    EXTRACT(ISODOW FROM d)::int               AS dow   -- 1=월 … 7=일
  FROM generate_series('2026-03-30'::date, '2026-05-31'::date, '1 day'::interval) d
)
-- 오픈 (매일, 직원 7명 순환)
SELECT
  ('00000000-0000-0000-0000-' || lpad(((n % 7) + 1)::text, 12, '0'))::uuid,
  dt, '오픈', '08:00', '14:00', 6
FROM dates
UNION ALL
-- 마감 (매일, 오픈과 다른 직원)
SELECT
  ('00000000-0000-0000-0000-' || lpad((((n + 4) % 7) + 1)::text, 12, '0'))::uuid,
  dt, '마감', '16:00', '22:00', 6
FROM dates
UNION ALL
-- 미들 (금·토·일만)
SELECT
  ('00000000-0000-0000-0000-' || lpad((((n + 2) % 7) + 1)::text, 12, '0'))::uuid,
  dt, '미들', '12:00', '18:00', 6
FROM dates WHERE dow IN (5, 6, 7)
UNION ALL
-- 주말 추가 오픈 1명 (토·일)
SELECT
  ('00000000-0000-0000-0000-' || lpad((((n + 1) % 7) + 1)::text, 12, '0'))::uuid,
  dt, '오픈', '08:00', '14:00', 6
FROM dates WHERE dow IN (6, 7);

-- 확인
SELECT
  to_char(date, 'YYYY-MM') AS month,
  count(*) AS rows
FROM schedules
WHERE date >= '2026-03-30' AND date <= '2026-05-31'
GROUP BY 1
ORDER BY 1;
