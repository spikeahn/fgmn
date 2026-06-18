'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { calculateWeeklySalary, type WeeklySalaryResult } from '@/lib/salaryCalculator'

// ── 조회 기간 ────────────────────────────────────────────

const WEEKS = [
  { label: '1주차', range: '6/1 – 6/7',   start: '2026-06-01', end: '2026-06-07' },
  { label: '2주차', range: '6/8 – 6/14',  start: '2026-06-08', end: '2026-06-14' },
  { label: '3주차', range: '6/15 – 6/21', start: '2026-06-15', end: '2026-06-21' },
]

// ── 타입 ─────────────────────────────────────────────────

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

// ── 서브 컴포넌트 ─────────────────────────────────────────

function KPI({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${accent ? 'text-amber-700' : 'text-stone-800'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-400">{sub}</p>}
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

// ── 계산 함수 ─────────────────────────────────────────────

function buildReport(staffList: DbStaff[], schedules: DbSchedule[]): StaffReport[] {
  return staffList.filter(s => s.is_active).map(staff => {
    const hoursAccum: number[] = []

    const weeks: WeekRow[] = WEEKS.map(week => {
      const thisWeek = schedules.filter(
        s => s.staff_id === staff.id && s.date >= week.start && s.date <= week.end
      )
      const weeklyHours = thisWeek.reduce((acc, s) => acc + Number(s.recorded_hours ?? 0), 0)

      const result = calculateWeeklySalary({
        weeklyHours,
        recentWeeksHours: [...hoursAccum],
        hourlyWage: staff.hourly_wage,
      })
      hoursAccum.push(weeklyHours)

      return {
        ...result,
        label:     week.label,
        range:     week.range,
        days:      thisWeek.length,
        shiftList: thisWeek.sort((a, b) => a.date.localeCompare(b.date)).map(s => s.shift_type ?? ''),
      }
    })

    const monthlyHours   = weeks.reduce((a, w) => a + w.weeklyHours, 0)
    const monthlyRegular = weeks.reduce((a, w) => a + w.regularPay, 0)
    const monthlyHoliday = weeks.reduce((a, w) => a + w.holidayPay, 0)

    return { id: staff.id, name: staff.name, hourlyWage: staff.hourly_wage, weeks, monthlyHours, monthlyRegular, monthlyHoliday, monthlyTotal: monthlyRegular + monthlyHoliday }
  })
}

// ── 메인 페이지 ──────────────────────────────────────────

export default function ReportPage() {
  const [staffList,  setStaffList]  = useState<DbStaff[]>([])
  const [schedules,  setSchedules]  = useState<DbSchedule[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: staffData }, { data: schData }] = await Promise.all([
        supabase.from('staffs').select('*').order('name'),
        supabase.from('schedules').select('id, staff_id, date, shift_type, note, recorded_hours')
          .gte('date', WEEKS[0].start).lte('date', WEEKS[WEEKS.length - 1].end),
      ])
      if (staffData)  setStaffList(staffData as DbStaff[])
      if (schData)    setSchedules(schData as DbSchedule[])
      setLoading(false)
    }
    load()
  }, [])

  const report = useMemo(() => buildReport(staffList, schedules), [staffList, schedules])

  const grand = useMemo(() => ({
    hours:   report.reduce((a, d) => a + d.monthlyHours,   0),
    regular: report.reduce((a, d) => a + d.monthlyRegular, 0),
    holiday: report.reduce((a, d) => a + d.monthlyHoliday, 0),
    total:   report.reduce((a, d) => a + d.monthlyTotal,   0),
  }), [report])

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
    <main className="min-h-screen bg-[#FAF8F5] px-6 py-8">
      <div className="mx-auto max-w-4xl">

        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-stone-800">근무내역 리포트</h1>
          <p className="mt-1 text-sm text-stone-400">
            2026년 6월 1일 – 21일 (3주) &nbsp;·&nbsp; 재직 중 직원 {report.length}명
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KPI label="총 근무시간"   value={`${grand.hours}h`} />
          <KPI label="기본급 합계"   value={`₩${grand.regular.toLocaleString()}`} />
          <KPI label="주휴수당 합계" value={`₩${grand.holiday.toLocaleString()}`} />
          <KPI label="지급 총액"     value={`₩${grand.total.toLocaleString()}`} accent />
        </div>

        {report.map(staff => (
          <div key={staff.id} className="mb-5 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="text-base font-extrabold text-stone-800">{staff.name}</span>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-stone-500 ring-1 ring-stone-200">시급 ₩{staff.hourlyWage.toLocaleString()}</span>
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
                        {week.days === 0 ? <span className="text-xs text-stone-300">근무 없음</span> : <ShiftPips list={week.shiftList} />}
                      </td>
                      <td className="px-4 py-3 text-right text-stone-600">{week.days}일</td>
                      <td className="px-4 py-3 text-right font-semibold text-stone-700">{week.weeklyHours}h</td>
                      <td className="px-4 py-3 text-right text-xs text-stone-400">{week.avgHours}h</td>
                      <td className="px-4 py-3 text-right text-stone-600">₩{week.regularPay.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        {week.qualifies ? <span className="font-semibold text-amber-600">+₩{week.holidayPay.toLocaleString()}</span> : <span className="text-xs text-stone-300">{week.weeklyHours > 0 ? '15h 미만' : '–'}</span>}
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
