'use client'

import { useState, useEffect, useMemo } from 'react'
import { startOfWeek, addDays, format as fmtDate } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { calculateWeeklySalary, type WeeklySalaryResult } from '@/lib/salaryCalculator'

// ── 헬퍼 ──────────────────────────────────────────────────

interface WeekDef { label: string; range: string; start: string; end: string }

/**
 * 목요일이 속한 달 = 그 주의 달 (ISO 주차 규칙)
 * 예) 3/30(월)~4/5(일) → 목요일 4/2 → 4월 1주
 *     4/27(월)~5/3(일) → 목요일 4/30 → 4월 5주
 */
function getMonthWeeks(year: number, month: number): WeekDef[] {
  const weeks: WeekDef[] = []

  // 해당 월 1일이 속한 주의 월요일
  const firstOfMonth = new Date(year, month - 1, 1)
  let monday = startOfWeek(firstOfMonth, { weekStartsOn: 1 })

  // 첫 번째 후보 주의 목요일이 이 달이 아니면 한 주 앞으로
  if (addDays(monday, 3).getMonth() + 1 !== month) {
    monday = addDays(monday, 7)
  }

  let weekNum = 1
  while (true) {
    const thu = addDays(monday, 3)
    if (thu.getFullYear() !== year || thu.getMonth() + 1 !== month) break

    const sunday = addDays(monday, 6)
    const sm = monday.getMonth() + 1, sd = monday.getDate()
    const em = sunday.getMonth() + 1, ed = sunday.getDate()

    weeks.push({
      label: `${weekNum}주차`,
      range: sm === em ? `${sm}/${sd}–${ed}` : `${sm}/${sd}–${em}/${ed}`,
      start: fmtDate(monday, 'yyyy-MM-dd'),
      end:   fmtDate(sunday, 'yyyy-MM-dd'),
    })

    monday = addDays(monday, 7)
    weekNum++
  }

  return weeks
}

// ── 타입 ──────────────────────────────────────────────────

interface DbStaff    { id: string; name: string; hourly_wage: number; is_active: boolean }
interface DbSchedule { id: string; staff_id: string; date: string; shift_type: string | null; note: string | null; recorded_hours: number }

interface WeekRow extends WeeklySalaryResult {
  label:     string
  range:     string
  days:      number
  shiftList: string[]
}

interface StaffReport {
  id:             string
  name:           string
  hourlyWage:     number
  weeks:          WeekRow[]
  monthlyHours:   number
  monthlyRegular: number
  monthlyHoliday: number
  monthlyTotal:   number
}

// ── 계산 ──────────────────────────────────────────────────

function buildReport(staffList: DbStaff[], schedules: DbSchedule[], weeks: WeekDef[]): StaffReport[] {
  return staffList.filter(s => s.is_active).map(staff => {
    const hoursAccum: number[] = []

    const weekRows: WeekRow[] = weeks.map(week => {
      const thisWeek = schedules.filter(
        s => s.staff_id === staff.id && s.date >= week.start && s.date <= week.end
      )
      const weeklyHours = thisWeek.reduce((acc, s) => acc + Number(s.recorded_hours ?? 0), 0)
      const result = calculateWeeklySalary({ weeklyHours, recentWeeksHours: [...hoursAccum], hourlyWage: staff.hourly_wage })
      hoursAccum.push(weeklyHours)
      return {
        ...result,
        label:     week.label,
        range:     week.range,
        days:      thisWeek.length,
        shiftList: thisWeek.sort((a, b) => a.date.localeCompare(b.date)).map(s => s.shift_type ?? ''),
      }
    })

    const monthlyHours   = weekRows.reduce((a, w) => a + w.weeklyHours, 0)
    const monthlyRegular = weekRows.reduce((a, w) => a + w.regularPay, 0)
    const monthlyHoliday = weekRows.reduce((a, w) => a + w.holidayPay, 0)

    return {
      id: staff.id, name: staff.name, hourlyWage: staff.hourly_wage,
      weeks: weekRows, monthlyHours, monthlyRegular, monthlyHoliday,
      monthlyTotal: monthlyRegular + monthlyHoliday,
    }
  })
}

// ── CSV 내보내기 ───────────────────────────────────────────

function exportCSV(report: StaffReport[], year: number, month: number) {
  const header = ['직원', '시급', '주차', '기간', '일수', '근무시간(h)', '기본급(₩)', '주휴수당(₩)', '합계(₩)']
  const rows: string[][] = [header]

  for (const staff of report) {
    for (const w of staff.weeks) {
      rows.push([
        staff.name, String(staff.hourlyWage),
        w.label, w.range,
        String(w.days), String(w.weeklyHours),
        String(w.regularPay), String(w.holidayPay), String(w.totalPay),
      ])
    }
    rows.push([
      staff.name, '',
      '월간합계', '',
      String(staff.weeks.reduce((a, w) => a + w.days, 0)),
      String(staff.monthlyHours),
      String(staff.monthlyRegular), String(staff.monthlyHoliday), String(staff.monthlyTotal),
    ])
    rows.push(Array(header.length).fill(''))
  }

  // BOM 포함 → 한글 엑셀에서 깨짐 없음
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `급여리포트_${year}년_${month}월.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── 서브 컴포넌트 ──────────────────────────────────────────

function KPI({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${accent ? 'text-amber-700' : 'text-stone-800'}`}>{value}</p>
    </div>
  )
}

const SHIFT_COLOR: Record<string, string> = {
  '오픈': 'bg-amber-100  text-amber-700',
  '미들': 'bg-emerald-100 text-emerald-700',
  '마감': 'bg-violet-100  text-violet-700',
}

function ShiftPips({ list }: { list: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((type, i) => (
        <span key={i} className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${SHIFT_COLOR[type] ?? ''}`}>{type}</span>
      ))}
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────

export default function ReportPage() {
  const today = new Date()
  const [year,      setYear]      = useState(today.getFullYear())
  const [month,     setMonth]     = useState(today.getMonth() + 1)
  const [staffList, setStaffList] = useState<DbStaff[]>([])
  const [schedules, setSchedules] = useState<DbSchedule[]>([])
  const [loading,   setLoading]   = useState(true)

  const weeks = useMemo(() => getMonthWeeks(year, month), [year, month])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const w = getMonthWeeks(year, month)
      const [{ data: staffData }, { data: schData }] = await Promise.all([
        supabase.from('staffs').select('*').order('name'),
        supabase.from('schedules')
          .select('id, staff_id, date, shift_type, note, recorded_hours')
          .gte('date', w[0].start)
          .lte('date', w[w.length - 1].end),
      ])
      if (staffData) setStaffList(staffData as DbStaff[])
      if (schData)   setSchedules(schData as DbSchedule[])
      setLoading(false)
    }
    load()
  }, [year, month])

  const report = useMemo(() => buildReport(staffList, schedules, weeks), [staffList, schedules, weeks])

  const grand = useMemo(() => ({
    hours:   report.reduce((a, d) => a + d.monthlyHours,   0),
    regular: report.reduce((a, d) => a + d.monthlyRegular, 0),
    holiday: report.reduce((a, d) => a + d.monthlyHoliday, 0),
    total:   report.reduce((a, d) => a + d.monthlyTotal,   0),
  }), [report])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
          <p className="text-sm text-stone-400">급여 데이터 불러오는 중...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5] px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">

        {/* ── 헤더 ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-stone-800">근무내역 리포트</h1>
            <p className="mt-1 text-sm text-stone-400">재직 중 직원 {report.length}명</p>
          </div>

          <div className="flex items-center gap-2">
            {/* 월 네비게이션 */}
            <button
              onClick={prevMonth}
              className="rounded-xl border border-stone-200 bg-white p-2 text-stone-500 shadow-sm hover:bg-stone-50 active:scale-90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            <div className="min-w-[110px] rounded-xl border border-stone-200 bg-white px-4 py-2 text-center shadow-sm">
              <span className="text-sm font-semibold text-stone-700">{year}년 {month}월</span>
            </div>

            <button
              onClick={nextMonth}
              className="rounded-xl border border-stone-200 bg-white p-2 text-stone-500 shadow-sm hover:bg-stone-50 active:scale-90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>

            <button
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1) }}
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-100 active:scale-95"
            >
              이번 달
            </button>

            {/* CSV 내보내기 */}
            <button
              onClick={() => exportCSV(report, year, month)}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-600 shadow-sm hover:bg-stone-50 active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              CSV 저장
            </button>
          </div>
        </div>

        {/* ── KPI ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KPI label="총 근무시간"   value={`${grand.hours}h`} />
          <KPI label="기본급 합계"   value={`₩${grand.regular.toLocaleString()}`} />
          <KPI label="주휴수당 합계" value={`₩${grand.holiday.toLocaleString()}`} />
          <KPI label="지급 총액"     value={`₩${grand.total.toLocaleString()}`} accent />
        </div>

        {/* ── 직원별 카드 ── */}
        {report.map(staff => (
          <div key={staff.id} className="mb-5 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="text-base font-extrabold text-stone-800">{staff.name}</span>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-stone-500 ring-1 ring-stone-200">
                  시급 ₩{staff.hourlyWage.toLocaleString()}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-stone-400">월간 지급액</span>
                <span className="ml-2 text-base font-extrabold text-amber-600">₩{staff.monthlyTotal.toLocaleString()}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                    <th className="px-4 py-2.5 text-left">주차</th>
                    <th className="px-4 py-2.5 text-left">근무 내역</th>
                    <th className="px-4 py-2.5 text-right">일수</th>
                    <th className="px-4 py-2.5 text-right">근무시간</th>
                    <th className="px-4 py-2.5 text-right">4주 평균</th>
                    <th className="px-4 py-2.5 text-right">기본급</th>
                    <th className="px-4 py-2.5 text-right">주휴수당</th>
                    <th className="px-4 py-2.5 text-right">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.weeks.map(week => (
                    <tr key={week.label} className="border-b border-stone-50 transition-colors hover:bg-stone-50/50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-stone-700">{week.label}</p>
                        <p className="text-[11px] text-stone-400">{week.range}</p>
                      </td>
                      <td className="px-4 py-3">
                        {week.days === 0
                          ? <span className="text-xs text-stone-300">근무 없음</span>
                          : <ShiftPips list={week.shiftList} />}
                      </td>
                      <td className="px-4 py-3 text-right text-stone-600">{week.days}일</td>
                      <td className="px-4 py-3 text-right font-semibold text-stone-700">{week.weeklyHours}h</td>
                      <td className="px-4 py-3 text-right text-xs text-stone-400">{week.avgHours}h</td>
                      <td className="px-4 py-3 text-right text-stone-600">₩{week.regularPay.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        {week.qualifies
                          ? <span className="font-semibold text-amber-600">+₩{week.holidayPay.toLocaleString()}</span>
                          : <span className="text-xs text-stone-300">{week.weeklyHours > 0 ? '15h 미만' : '–'}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-stone-800">₩{week.totalPay.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-amber-100 bg-amber-50/60">
                    <td className="px-4 py-3 font-extrabold text-amber-800" colSpan={2}>월간 합계</td>
                    <td className="px-4 py-3 text-right font-semibold text-stone-600">{staff.weeks.reduce((a, w) => a + w.days, 0)}일</td>
                    <td className="px-4 py-3 text-right font-extrabold text-stone-800">{staff.monthlyHours}h</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-semibold text-stone-600">₩{staff.monthlyRegular.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-600">+₩{staff.monthlyHoliday.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-amber-700">₩{staff.monthlyTotal.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* ── 전체 인건비 합계 ── */}
        <div className="overflow-hidden rounded-2xl border-2 border-amber-200 bg-amber-50">
          <div className="border-b border-amber-100 px-5 py-3">
            <span className="font-extrabold text-amber-900">전체 인건비 합계</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">
                  <th className="px-4 py-2.5 text-left">직원</th>
                  <th className="px-4 py-2.5 text-right">총 시간</th>
                  <th className="px-4 py-2.5 text-right">기본급</th>
                  <th className="px-4 py-2.5 text-right">주휴수당</th>
                  <th className="px-4 py-2.5 text-right">지급액</th>
                </tr>
              </thead>
              <tbody>
                {report.map(staff => (
                  <tr key={staff.id} className="border-t border-amber-100">
                    <td className="px-4 py-2.5 font-semibold text-stone-700">{staff.name}</td>
                    <td className="px-4 py-2.5 text-right text-stone-600">{staff.monthlyHours}h</td>
                    <td className="px-4 py-2.5 text-right text-stone-600">₩{staff.monthlyRegular.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600">+₩{staff.monthlyHoliday.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-stone-800">₩{staff.monthlyTotal.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-amber-200 bg-amber-100/60">
                  <td className="px-4 py-3 font-extrabold text-amber-900">합 계</td>
                  <td className="px-4 py-3 text-right font-extrabold text-stone-800">{grand.hours}h</td>
                  <td className="px-4 py-3 text-right font-extrabold text-stone-800">₩{grand.regular.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-extrabold text-amber-700">+₩{grand.holiday.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-base font-extrabold text-amber-800">₩{grand.total.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  )
}
