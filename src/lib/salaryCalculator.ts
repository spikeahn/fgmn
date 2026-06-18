/**
 * 주간 급여 계산
 *
 * 주휴수당 요건 (근로기준법 제55조)
 *   - 해당 주 소정 근로시간 15시간 이상
 *   - 최근 4주 평균 근로시간 15시간 이상
 *
 * 주휴시간 = min(주 근무시간 / 5, 8h)
 * 주휴수당 = floor(주휴시간 × 시급)  — 소수점 버림
 */

export interface WeeklySalaryInput {
  weeklyHours:       number    // 해당 주 총 근무시간
  recentWeeksHours:  number[]  // 이전 최대 3주 근무시간 (오래된 것부터)
  hourlyWage:        number    // 시급 (원)
}

export interface WeeklySalaryResult {
  weeklyHours:      number   // 입력 그대로
  regularPay:       number   // 기본급 = floor(시간 × 시급)
  holidayPayHours:  number   // 주휴 인정 시간
  holidayPay:       number   // 주휴수당
  totalPay:         number   // 기본급 + 주휴수당
  qualifies:        boolean  // 주휴수당 해당 여부
  avgHours:         number   // 4주 평균 (소수 첫째 자리)
}

export function calculateWeeklySalary(input: WeeklySalaryInput): WeeklySalaryResult {
  const { weeklyHours, recentWeeksHours, hourlyWage } = input

  // 이번 주 포함 최대 4주 슬라이딩 윈도우 — 근무 주차 수와 무관하게 항상 4로 나눔
  const window4 = [...recentWeeksHours, weeklyHours].slice(-4)
  const avgHours = Math.round(
    (window4.reduce((a, b) => a + b, 0) / 4) * 10
  ) / 10

  const qualifies = weeklyHours >= 15 && avgHours >= 15

  const regularPay      = Math.floor(weeklyHours * hourlyWage)
  const holidayPayHours = qualifies ? Math.min(weeklyHours / 5, 8) : 0
  const holidayPay      = Math.floor(holidayPayHours * hourlyWage)

  return {
    weeklyHours,
    regularPay,
    holidayPayHours,
    holidayPay,
    totalPay: regularPay + holidayPay,
    qualifies,
    avgHours,
  }
}
