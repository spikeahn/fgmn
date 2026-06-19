'use client'

import 'react-big-calendar/lib/css/react-big-calendar.css'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/contexts/AdminContext'
import { StaffModal, COLOR_PALETTE } from '@/components/StaffModal'
import type { StaffItem } from '@/components/StaffModal'
import type { ShiftType } from '@/types/database'

// ── Localizer ────────────────────────────────────────────

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { ko },
})

// ── 초기 기본값 (변경해도 기존 일정에 영향 없음) ─────────

const DEFAULT_TIMES: Record<ShiftType, { start: string; end: string }> = {
  '오픈': { start: '08:00', end: '14:00' },
  '미들': { start: '12:00', end: '18:00' },
  '마감': { start: '16:00', end: '22:00' },
}


const SHIFT_BADGE: Record<ShiftType, string> = {
  '오픈': 'bg-amber-100  text-amber-800  ring-amber-300',
  '미들': 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  '마감': 'bg-violet-100  text-violet-800  ring-violet-300',
}

// ── 타입 ─────────────────────────────────────────────────

interface LocalSchedule {
  id:        string
  staffId:   string
  date:      string      // YYYY-MM-DD
  shiftType: ShiftType
  startTime: string      // HH:MM — 저장 시 고정, 기본값 변경과 무관
  endTime:   string
  note:      string
}

interface CalEvent {
  id:       string
  title:    string
  start:    Date
  end:      Date
  resource: LocalSchedule
}

type Modal =
  | null
  | { mode: 'create'; date: string }
  | { mode: 'edit';   schedule: LocalSchedule }

interface FormState {
  staffId:   string
  shiftType: ShiftType
  startTime: string
  endTime:   string
  note:      string
}

type ShiftDefaults = Record<ShiftType, { start: string; end: string }>

// ── 월간 그리드 상수 / 헬퍼 ──────────────────────────────

const HOUR_H    = 28   // px per hour
const G_START   = 7    // 07:00
const G_END     = 23   // 23:00
const G_HOURS   = G_END - G_START   // 16 슬롯
const DAY_W     = 46   // px per day column

function pad2(n: number) { return String(n).padStart(2, '0') }
function timeTop(t: string) {
  const [h, m] = t.split(':').map(Number)
  return (h - G_START + m / 60) * HOUR_H
}
function timePx(s: string, e: string) {
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  return ((eh + em / 60) - (sh + sm / 60)) * HOUR_H
}

// ── 월간 그리드 뷰 ────────────────────────────────────────

function MonthGridView({
  schedules, staffs, staffColorMap, year, month, onEdit, onCreate,
}: {
  schedules:    LocalSchedule[]
  staffs:       StaffBasic[]
  staffColorMap: Map<string, typeof COLOR_PALETTE[0]>
  year:         number
  month:        number
  onEdit:       (s: LocalSchedule) => void
  onCreate:     (date: string) => void
}) {
  const days        = new Date(year, month, 0).getDate()
  const monthPfx    = `${year}-${pad2(month)}`
  const hours       = Array.from({ length: G_HOURS + 1 }, (_, i) => G_START + i)
  const dayNums     = Array.from({ length: days }, (_, i) => i + 1)

  const byDay = useMemo(() => {
    const map = new Map<number, LocalSchedule[]>()
    for (const s of schedules) {
      if (!s.date.startsWith(monthPfx)) continue
      const d = parseInt(s.date.slice(8, 10))
      map.set(d, [...(map.get(d) ?? []), s])
    }
    return map
  }, [schedules, monthPfx])

  const totalW = 56 + days * DAY_W

  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div style={{ minWidth: totalW }}>

        {/* ── 날짜 헤더 ── */}
        <div className="flex border-b border-stone-200 bg-stone-50 sticky top-0 z-10">
          <div style={{ width: 56 }} className="flex-shrink-0 border-r border-stone-200" />
          {dayNums.map(d => {
            const dow = new Date(year, month - 1, d).getDay()
            return (
              <div
                key={d}
                style={{ width: DAY_W }}
                className={`flex-shrink-0 border-r border-stone-100 text-center py-1.5 text-xs font-semibold ${
                  dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-stone-500'
                }`}
              >
                <div>{d}</div>
                <div className="text-[9px] font-normal opacity-50">
                  {['일','월','화','수','목','금','토'][dow]}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 시간 × 날짜 그리드 ── */}
        <div className="flex">

          {/* 시간 레이블 */}
          <div style={{ width: 56 }} className="flex-shrink-0 border-r border-stone-200">
            {hours.map((h, i) => (
              <div
                key={h}
                style={{ height: HOUR_H }}
                className={`text-[10px] text-stone-400 pr-2 flex items-start justify-end pt-0.5 ${i < hours.length - 1 ? 'border-b border-stone-100' : ''}`}
              >
                {pad2(h)}:00
              </div>
            ))}
          </div>

          {/* 날짜 열 */}
          {dayNums.map(d => {
            const dateStr = `${year}-${pad2(month)}-${pad2(d)}`
            const evts    = byDay.get(d) ?? []
            const dow     = new Date(year, month - 1, d).getDay()

            return (
              <div
                key={d}
                style={{ width: DAY_W, height: G_HOURS * HOUR_H, position: 'relative' }}
                className={`flex-shrink-0 border-r border-stone-100 cursor-pointer ${
                  dow === 0 ? 'bg-red-50/30' : dow === 6 ? 'bg-blue-50/30' : 'hover:bg-stone-50/60'
                }`}
                onClick={() => onCreate(dateStr)}
              >
                {/* 시간선 */}
                {Array.from({ length: G_HOURS }, (_, i) => (
                  <div key={i} style={{ top: i * HOUR_H }} className="absolute inset-x-0 border-b border-stone-100/80 pointer-events-none" />
                ))}

                {/* 이벤트 블록 */}
                {evts.map(s => {
                  const c    = staffColorMap.get(s.staffId) ?? COLOR_PALETTE[0]
                  const name = staffs.find(st => st.id === s.staffId)?.name ?? ''
                  const top  = Math.max(timeTop(s.startTime), 0)
                  const h    = Math.max(timePx(s.startTime, s.endTime), 12)
                  return (
                    <div
                      key={s.id}
                      style={{
                        position: 'absolute', top, height: h,
                        left: 2, right: 2,
                        backgroundColor: c.bg,
                        color: c.text,
                        borderLeft: `3px solid ${c.dot}`,
                      }}
                      className="rounded-sm overflow-hidden text-[8px] font-bold px-0.5 leading-tight"
                      onClick={e => { e.stopPropagation(); onEdit(s) }}
                      title={`${name}  ${s.startTime}–${s.endTime}`}
                    >
                      {h >= 18 ? name.slice(0, 2) : ''}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}

// ── 헬퍼 ─────────────────────────────────────────────────

type StaffBasic = StaffItem

function makeToCalEvent(staffs: StaffBasic[]) {
  return (s: LocalSchedule): CalEvent => {
    const staffName = staffs.find(st => st.id === s.staffId)?.name ?? '(미지정)'
    return {
      id:    s.id,
      title: staffName,
      start: new Date(`${s.date}T${s.startTime}:00`),
      end:   new Date(`${s.date}T${s.endTime}:00`),
      resource: s,
    }
  }
}

function timeToHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 10) / 10
}

function getWeekLabel(date: Date): string {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const end   = addDays(start, 6)
  const s = format(start, 'yyyy년 M월 d일', { locale: ko })
  const e = start.getMonth() === end.getMonth()
    ? format(end, 'd일', { locale: ko })
    : format(end, 'M월 d일', { locale: ko })
  return `${s} – ${e}`
}

// ── 이벤트 카드 렌더러 ───────────────────────────────────

function CalEventCard({ event }: { event: CalEvent }) {
  return (
    <div className="leading-tight overflow-hidden">
      <div className="font-semibold truncate">{event.title}</div>
      {event.resource.note && (
        <div className="mt-0.5 truncate text-[10px] opacity-70">{event.resource.note}</div>
      )}
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────

export default function SchedulePage() {
  const { isAdmin } = useAdmin()
  const [staffs,        setStaffs]        = useState<StaffBasic[]>([])
  const [schedules,     setSchedules]     = useState<LocalSchedule[]>([])
  const [loading,       setLoading]       = useState(true)
  const [calDate,       setCalDate]       = useState(new Date())
  const [view,          setView]          = useState<'week' | 'month'>('week')
  const [modal,         setModal]         = useState<Modal>(null)
  const [showSettings,  setShowSettings]  = useState(false)
  const [showStaffMgr,  setShowStaffMgr]  = useState(false)
  const [editingStaff,  setEditingStaff]  = useState<StaffBasic | 'new' | null>(null)
  const [shiftDefaults, setShiftDefaults] = useState<ShiftDefaults>(() =>
    JSON.parse(JSON.stringify(DEFAULT_TIMES))
  )
  const [form, setForm] = useState<FormState>({
    staffId:   '',
    shiftType: '오픈',
    startTime: DEFAULT_TIMES['오픈'].start,
    endTime:   DEFAULT_TIMES['오픈'].end,
    note:      '',
  })

  // ── Supabase 로드 ─────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true)
      const year = new Date().getFullYear()

      const [{ data: staffData }, { data: schData }] = await Promise.all([
        supabase.from('staffs').select('*').order('name'),
        supabase.from('schedules').select('*')
          .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`),
      ])

      if (staffData) {
        setStaffs(staffData as StaffBasic[])
        setForm(f => ({ ...f, staffId: (staffData[0] as StaffBasic)?.id ?? '' }))
      }

      if (schData) {
        setSchedules((schData as Array<{
          id: string; staff_id: string; date: string
          shift_type: string | null; start_time: string | null
          end_time: string | null; note: string | null
        }>).filter(s => s.shift_type).map(s => ({
          id:        s.id,
          staffId:   s.staff_id,
          date:      s.date,
          shiftType: s.shift_type as ShiftType,
          startTime: (s.start_time ?? DEFAULT_TIMES[s.shift_type as ShiftType].start).slice(0, 5),
          endTime:   (s.end_time   ?? DEFAULT_TIMES[s.shift_type as ShiftType].end).slice(0, 5),
          note:      s.note ?? '',
        })))
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── 달력 이벤트 변환 ────────────────────────────────────

  const toCalEvent = useMemo(() => makeToCalEvent(staffs), [staffs])

  const events = useMemo<CalEvent[]>(
    () => schedules.map(toCalEvent),
    [schedules, toCalEvent],
  )

  // 직원별 컬러 맵 (color_index 우선, 없으면 순서 기반)
  const staffColorMap = useMemo(() => {
    const map = new Map<string, typeof COLOR_PALETTE[0]>()
    staffs.forEach((s, i) => {
      const idx = s.color_index !== null && s.color_index !== undefined
        ? s.color_index
        : i
      map.set(s.id, COLOR_PALETTE[idx % COLOR_PALETTE.length])
    })
    return map
  }, [staffs])

  // 직원 관리
  async function saveStaff(staff: StaffBasic) {
    if (staff.id.startsWith('new-')) {
      const { data } = await supabase
        .from('staffs')
        .insert({ name: staff.name, hourly_wage: staff.hourly_wage, is_active: true, color_index: staff.color_index })
        .select()
        .single()
      if (data) setStaffs(prev => [...prev, data as StaffBasic])
    } else {
      await supabase.from('staffs').update({ name: staff.name, hourly_wage: staff.hourly_wage, color_index: staff.color_index }).eq('id', staff.id)
      setStaffs(prev => prev.map(s => s.id === staff.id ? { ...s, ...staff } : s))
    }
    setEditingStaff(null)
  }

  async function toggleStaffActive(id: string) {
    const s = staffs.find(s => s.id === id)
    if (!s) return
    await supabase.from('staffs').update({ is_active: !s.is_active }).eq('id', id)
    setStaffs(prev => prev.map(s => s.id === id ? { ...s, is_active: !s.is_active } : s))
  }

  const eventPropGetter = useCallback((event: CalEvent) => {
    const c = staffColorMap.get(event.resource.staffId) ?? COLOR_PALETTE[0]
    return { style: { backgroundColor: c.bg, color: c.text } }
  }, [staffColorMap])

  // 이번 주(calDate 기준) 직원별 배정 시간
  const weekStats = useMemo(() => {
    const weekStart = startOfWeek(calDate, { weekStartsOn: 1 })
    const weekEnd   = addDays(weekStart, 6)
    const s0 = format(weekStart, 'yyyy-MM-dd')
    const s1 = format(weekEnd,   'yyyy-MM-dd')
    return staffs.map(staff => {
      const rows = schedules.filter(s => s.staffId === staff.id && s.date >= s0 && s.date <= s1)
      const hours = rows.reduce((acc, s) => acc + timeToHours(s.startTime, s.endTime), 0)
      return { staff, hours, count: rows.length }
    })
  }, [calDate, schedules, staffs])

  // ── 캘린더 이벤트 핸들러 ────────────────────────────────

  const onSelectSlot = useCallback((slotInfo: { start: Date }) => {
    const date = format(slotInfo.start, 'yyyy-MM-dd')
    setForm(f => ({
      staffId:   staffs[0]?.id ?? f.staffId,
      shiftType: '오픈',
      startTime: shiftDefaults['오픈'].start,
      endTime:   shiftDefaults['오픈'].end,
      note:      '',
    }))
    setModal({ mode: 'create', date })
  }, [shiftDefaults, staffs])

  const onSelectEvent = useCallback((event: CalEvent) => {
    const s = event.resource
    setForm({ staffId: s.staffId, shiftType: s.shiftType, startTime: s.startTime, endTime: s.endTime, note: s.note })
    setModal({ mode: 'edit', schedule: s })
  }, [])

  // 근무 타입 변경 시 현재 기본값으로 시간 자동 채움
  function selectShiftType(type: ShiftType) {
    setForm(f => ({
      ...f,
      shiftType: type,
      startTime: shiftDefaults[type].start,
      endTime:   shiftDefaults[type].end,
    }))
  }

  // ── 저장 / 삭제 ─────────────────────────────────────────

  async function handleSave() {
    if (!modal) return
    const recorded_hours = timeToHours(form.startTime, form.endTime)

    if (modal.mode === 'create') {
      const { data } = await supabase.from('schedules').insert({
        staff_id:       form.staffId,
        date:           modal.date,
        shift_type:     form.shiftType,
        start_time:     form.startTime,
        end_time:       form.endTime,
        note:           form.note,
        recorded_hours,
      }).select().single()

      if (data) {
        const row = data as { id: string; staff_id: string; date: string; shift_type: string; note: string | null }
        setSchedules(prev => [...prev, {
          id: row.id, staffId: row.staff_id, date: row.date,
          shiftType: row.shift_type as ShiftType,
          startTime: form.startTime, endTime: form.endTime, note: row.note ?? '',
        }])
      }
    } else {
      await supabase.from('schedules').update({
        staff_id:   form.staffId,
        shift_type: form.shiftType,
        start_time: form.startTime,
        end_time:   form.endTime,
        note:       form.note,
        recorded_hours,
      }).eq('id', modal.schedule.id)

      setSchedules(prev => prev.map(s =>
        s.id === modal.schedule.id
          ? { ...s, staffId: form.staffId, shiftType: form.shiftType,
              startTime: form.startTime, endTime: form.endTime, note: form.note }
          : s,
      ))
    }
    setModal(null)
  }

  async function handleDelete() {
    if (!modal || modal.mode !== 'edit') return
    await supabase.from('schedules').delete().eq('id', modal.schedule.id)
    setSchedules(prev => prev.filter(s => s.id !== modal.schedule.id))
    setModal(null)
  }

  // ── 시간 유효성 ─────────────────────────────────────────

  const timeError = form.startTime >= form.endTime
    ? '종료 시간은 시작 시간보다 늦어야 합니다.'
    : null

  // ── 모달 날짜 라벨 ───────────────────────────────────────

  const modalDateLabel = useMemo(() => {
    if (!modal) return ''
    const d = modal.mode === 'create' ? modal.date : modal.schedule.date
    return new Date(`${d}T12:00:00`).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    })
  }, [modal])

  // ── 달력 포맷 ────────────────────────────────────────────

  const calFormats = useMemo(() => ({
    timeGutterFormat: 'HH:mm',
    dayFormat: (date: Date) => format(date, 'EEE d', { locale: ko }),
    eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`,
  }), [])

  const weekLabel  = getWeekLabel(calDate)
  const monthLabel = `${calDate.getFullYear()}년 ${calDate.getMonth() + 1}월`
  const navLabel   = view === 'week' ? weekLabel : monthLabel

  function goBack() {
    if (view === 'week') setCalDate(d => addDays(d, -7))
    else setCalDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function goForward() {
    if (view === 'week') setCalDate(d => addDays(d, 7))
    else setCalDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  function onMonthEdit(s: LocalSchedule) {
    setForm({ staffId: s.staffId, shiftType: s.shiftType, startTime: s.startTime, endTime: s.endTime, note: s.note })
    setModal({ mode: 'edit', schedule: s })
  }
  function onMonthCreate(date: string) {
    setForm({
      staffId:   staffs.find(s => s.is_active)?.id ?? '',
      shiftType: '오픈',
      startTime: shiftDefaults['오픈'].start,
      endTime:   shiftDefaults['오픈'].end,
      note:      '',
    })
    setModal({ mode: 'create', date })
  }

  // ── 렌더 ────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
          <p className="text-sm text-stone-400">근무표 불러오는 중...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5] px-6 py-8 select-none">
      <div className="mx-auto max-w-6xl">

        {/* ── 상단 네비게이션 ── */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-stone-800">근무표</h1>

          <div className="flex items-center gap-2">
            {/* 뷰 토글 */}
            <div className="flex rounded-xl bg-stone-100 p-1">
              {(['week', 'month'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-all ${
                    view === v ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  {v === 'week' ? '주간' : '월간'}
                </button>
              ))}
            </div>

            {/* 직원 관리 (관리자 전용) */}
            {isAdmin && (
              <button
                onClick={() => setShowStaffMgr(true)}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-600 shadow-sm hover:bg-stone-50 active:scale-95"
              >
                직원 관리
              </button>
            )}

            {/* 이동 */}
            <button onClick={goBack} className="rounded-xl border border-stone-200 bg-white p-2 text-stone-500 shadow-sm hover:bg-stone-50 active:scale-90">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            <div className="min-w-[200px] rounded-xl border border-stone-200 bg-white px-4 py-2 text-center shadow-sm">
              <span className="text-sm font-semibold text-stone-700">{navLabel}</span>
            </div>

            <button onClick={goForward} className="rounded-xl border border-stone-200 bg-white p-2 text-stone-500 shadow-sm hover:bg-stone-50 active:scale-90">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>

            <button
              onClick={() => setCalDate(new Date())}
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-100 active:scale-95"
            >
              {view === 'week' ? '이번 주' : '이번 달'}
            </button>

            {/* 시간 설정 토글 */}
            <button
              onClick={() => setShowSettings(v => !v)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition-colors active:scale-95 ${
                showSettings
                  ? 'border-stone-400 bg-stone-700 text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                시간 설정
              </span>
            </button>
          </div>
        </div>

        {/* ── 시간 설정 패널 ── */}
        {showSettings && (
          <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold text-stone-700">근무 시간 기본값 설정</h2>
                <p className="mt-0.5 text-xs text-stone-400">
                  이미 등록된 근무에는 영향 없음 · 신규 등록 시 기본값으로 사용됩니다.
                </p>
              </div>
              <button
                onClick={() => setShiftDefaults(JSON.parse(JSON.stringify(DEFAULT_TIMES)))}
                className="text-xs font-medium text-stone-400 underline hover:text-stone-600"
              >
                초기화
              </button>
            </div>

            <div className="space-y-2.5">
              {(['오픈', '미들', '마감'] as ShiftType[]).map(type => (
                <div key={type} className="flex items-center gap-3">
                  <span className={`w-14 rounded-full px-2.5 py-1 text-center text-xs font-bold ring-1 ${SHIFT_BADGE[type]}`}>
                    {type}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={shiftDefaults[type].start}
                      onChange={e =>
                        setShiftDefaults(prev => ({
                          ...prev,
                          [type]: { ...prev[type], start: e.target.value },
                        }))
                      }
                      className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <span className="text-stone-400">–</span>
                    <input
                      type="time"
                      value={shiftDefaults[type].end}
                      onChange={e =>
                        setShiftDefaults(prev => ({
                          ...prev,
                          [type]: { ...prev[type], end: e.target.value },
                        }))
                      }
                      className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  {/* 기본값과 다른 경우 표시 */}
                  {(shiftDefaults[type].start !== DEFAULT_TIMES[type].start ||
                    shiftDefaults[type].end   !== DEFAULT_TIMES[type].end) && (
                    <span className="text-[11px] text-amber-500">
                      기본: {DEFAULT_TIMES[type].start}–{DEFAULT_TIMES[type].end}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 직원 범례 ── */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {staffs.map((staff, i) => {
            const c = staffColorMap.get(staff.id) ?? COLOR_PALETTE[i % COLOR_PALETTE.length]
            return (
              <span
                key={staff.id}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1"
                style={{ backgroundColor: c.bg, color: c.text, ringColor: c.dot } as React.CSSProperties}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />
                {staff.name}
              </span>
            )
          })}
        </div>

        {/* ── 뷰 영역 ── */}
        {view === 'week' ? (
          <>
            <Calendar
              localizer={localizer}
              events={events}
              defaultView="week"
              views={['week']}
              date={calDate}
              onNavigate={setCalDate}
              culture="ko"
              selectable
              onSelectSlot={onSelectSlot as (slotInfo: object) => void}
              onSelectEvent={onSelectEvent as (event: object) => void}
              eventPropGetter={eventPropGetter as (event: object) => object}
              formats={calFormats as object}
              min={new Date(0, 0, 0, 7, 0)}
              max={new Date(0, 0, 0, 23, 0)}
              step={60}
              timeslots={1}
              style={{ height: 'calc(100vh - 280px)', minHeight: 540 }}
              components={{
                toolbar: () => null,
                event: CalEventCard as (props: object) => React.ReactElement,
              }}
            />

            {/* ── 이번 주 배정 시간 통계 ── */}
            <div className="mt-5 rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-stone-100 bg-stone-50 px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-stone-700">이번 주 배정 현황</span>
                <span className="text-xs text-stone-400">{weekLabel}</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-stone-100 sm:grid-cols-4 lg:grid-cols-7">
                {weekStats.map(({ staff, hours, count }) => {
                  const c = staffColorMap.get(staff.id) ?? COLOR_PALETTE[0]
                  return (
                    <div key={staff.id} className="flex flex-col items-center gap-1 px-3 py-4">
                      <span className="mb-1 h-2.5 w-2.5 rounded-full" style={{ background: c.dot }} />
                      <span className="text-xs font-semibold text-stone-700">{staff.name}</span>
                      <span className="text-xl font-extrabold" style={{ color: c.text }}>{hours}h</span>
                      <span className="text-[11px] text-stone-400">{count}회 배정</span>
                    </div>
                  )
                })}
              </div>
              <div className="border-t border-stone-100 bg-stone-50 px-5 py-2.5 flex items-center gap-4">
                <span className="text-xs text-stone-500">
                  총 <span className="font-bold text-stone-700">{weekStats.reduce((a, s) => a + s.hours, 0)}h</span> ·{' '}
                  <span className="font-bold text-stone-700">{weekStats.reduce((a, s) => a + s.count, 0)}회</span> 배정
                </span>
              </div>
            </div>
          </>
        ) : (
          <MonthGridView
            schedules={schedules}
            staffs={staffs}
            staffColorMap={staffColorMap}
            year={calDate.getFullYear()}
            month={calDate.getMonth() + 1}
            onEdit={onMonthEdit}
            onCreate={onMonthCreate}
          />
        )}

      </div>

      {/* ── 직원 관리 모달 ── */}
      {showStaffMgr && (
        <StaffModal
          staffList={staffs}
          editingStaff={editingStaff}
          setEditingStaff={s => setEditingStaff(s as StaffBasic | 'new' | null)}
          onSave={saveStaff}
          onToggleActive={toggleStaffActive}
          onClose={() => { setShowStaffMgr(false); setEditingStaff(null) }}
        />
      )}

      {/* ── 등록 / 수정 모달 ── */}
      {modal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setModal(null)}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* 모달 헤더 */}
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-stone-800">
                    {modal.mode === 'create' ? '근무 등록' : '근무 수정'}
                  </h2>
                  <p className="mt-0.5 text-sm text-stone-400">{modalDateLabel}</p>
                </div>
                <button
                  onClick={() => setModal(null)}
                  className="rounded-xl p-1.5 text-stone-400 hover:bg-stone-100"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 직원 선택 */}
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-400">직원</label>
                <select
                  value={form.staffId}
                  onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {staffs.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* 근무 타입 — 선택 시 현재 기본값으로 시간 자동 채움 */}
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-400">근무 타입</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['오픈', '미들', '마감'] as ShiftType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => selectShiftType(type)}
                      className={`rounded-xl py-2.5 text-sm font-semibold ring-1 transition-all active:scale-95 ${
                        form.shiftType === type
                          ? `${SHIFT_BADGE[type]} ring-2`
                          : 'bg-stone-50 text-stone-500 ring-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <span className="block">{type}</span>
                      <span className="block text-[10px] font-normal opacity-60">
                        {shiftDefaults[type].start}–{shiftDefaults[type].end}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 시작 / 종료 시간 */}
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-400">
                  근무 시간
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <span className="flex-shrink-0 text-sm text-stone-400">–</span>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                {timeError && (
                  <p className="mt-1.5 text-xs font-medium text-red-500">{timeError}</p>
                )}
              </div>

              {/* 메모 */}
              <div className="mb-6">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-400">메모</label>
                <textarea
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="인수인계 사항 등 메모를 남겨주세요"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* 버튼 */}
              <div className="flex gap-2">
                {modal.mode === 'edit' && (
                  <button
                    onClick={handleDelete}
                    className="flex-1 rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-100 active:scale-[0.99]"
                  >
                    삭제
                  </button>
                )}
                <button
                  onClick={() => setModal(null)}
                  className="flex-1 rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50 active:scale-[0.99]"
                >
                  취소
                </button>
                <button
                  disabled={!!timeError}
                  onClick={handleSave}
                  className="flex-[2] rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-600 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  저장
                </button>
              </div>

            </div>
          </div>
        </>
      )}
    </main>
  )
}
