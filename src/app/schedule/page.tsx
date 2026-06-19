'use client'

import 'react-big-calendar/lib/css/react-big-calendar.css'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
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

const SHIFT_STYLE: Record<ShiftType, { bg: string; color: string }> = {
  '오픈': { bg: '#fef3c7', color: '#92400e' },
  '미들': { bg: '#d1fae5', color: '#065f46' },
  '마감': { bg: '#ede9fe', color: '#5b21b6' },
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

// ── 헬퍼 ─────────────────────────────────────────────────

interface StaffBasic { id: string; name: string }

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
  const [staffs,        setStaffs]        = useState<StaffBasic[]>([])
  const [schedules,     setSchedules]     = useState<LocalSchedule[]>([])
  const [loading,       setLoading]       = useState(true)
  const [calDate,       setCalDate]       = useState(new Date())
  const [modal,         setModal]         = useState<Modal>(null)
  const [showSettings,  setShowSettings]  = useState(false)
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
        supabase.from('staffs').select('id, name').eq('is_active', true).order('name'),
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

  const eventPropGetter = useCallback((event: CalEvent) => {
    const style = SHIFT_STYLE[event.resource.shiftType]
    return { style: { backgroundColor: style.bg, color: style.color } }
  }, [])

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

  const weekLabel = getWeekLabel(calDate)

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
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-stone-800">근무표</h1>

          <div className="flex items-center gap-2">
            {/* 주 이동 */}
            <button
              onClick={() => setCalDate(d => addDays(d, -7))}
              className="rounded-xl border border-stone-200 bg-white p-2 text-stone-500 shadow-sm hover:bg-stone-50 active:scale-90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            <div className="min-w-[220px] rounded-xl border border-stone-200 bg-white px-4 py-2 text-center shadow-sm">
              <span className="text-sm font-semibold text-stone-700">{weekLabel}</span>
            </div>

            <button
              onClick={() => setCalDate(d => addDays(d, 7))}
              className="rounded-xl border border-stone-200 bg-white p-2 text-stone-500 shadow-sm hover:bg-stone-50 active:scale-90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>

            <button
              onClick={() => setCalDate(new Date())}
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-100 active:scale-95"
            >
              이번 주
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

        {/* ── 범례 ── */}
        <div className="mb-3 flex items-center gap-3">
          {(['오픈', '미들', '마감'] as ShiftType[]).map(type => (
            <span
              key={type}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${SHIFT_BADGE[type]}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: SHIFT_STYLE[type].color }} />
              {type}
              <span className="font-normal opacity-70">
                {shiftDefaults[type].start}–{shiftDefaults[type].end}
              </span>
            </span>
          ))}
        </div>

        {/* ── 캘린더 ── */}
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

      </div>

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
