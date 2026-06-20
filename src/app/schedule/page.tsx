'use client'

import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DnDCalendar = withDragAndDrop(Calendar as any) as any

// ── 초기 기본값 (변경해도 기존 일정에 영향 없음) ─────────

const DEFAULT_TIMES: Record<ShiftType, { start: string; end: string }> = {
  '오픈': { start: '09:30', end: '15:30' },
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
// 레이아웃: column = 시간(07~22), row = 날짜(1일~말일)

const G_START    = 9     // 09:00
const G_END      = 23    // 23:00
const G_HOURS    = G_END - G_START   // 16 슬롯

const T_COL_W    = 52    // px per 1-hour column
const DATE_LBL_W = 50    // px for date label column
const EVT_H      = 18    // px height of each event bar

function pad2(n: number) { return String(n).padStart(2, '0') }

// 이벤트 가로 시작 위치 (G_START 기준)
function timeLeft(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h - G_START + m / 60) * T_COL_W
}
// 이벤트 가로 너비 (시간 → px)
function timePxW(s: string, e: string): number {
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  return ((eh + em / 60) - (sh + sm / 60)) * T_COL_W
}

// ── 월간 그리드 뷰 ────────────────────────────────────────
// 레이아웃: row = 날짜(위→아래), column = 시간(왼→오른)
// 이벤트 바 mousedown → drag move(날짜·시간 변경) / 좌우 핸들 drag → resize

type MGDragType = 'move' | 'resizeStart' | 'resizeEnd'

interface MGDragState {
  type:          MGDragType
  schedule:      LocalSchedule
  initX:         number
  initY:         number
  initDayIdx:    number
  timeAreaLeft:  number   // viewport px (scrollLeft 보정)
  timeAreaWidth: number   // inner div 기준 실제 px
  rowH:          number
  durH:          number   // 드래그 중 고정할 근무 시간(h) — move 전용
  hasDragged:    boolean
  previewDate:   string
  previewStart:  string
  previewEnd:    string
}

interface MGPreview {
  scheduleId: string
  type:       MGDragType
  previewDate:  string
  previewStart: string
  previewEnd:   string
}

const SNAP = 15  // 15분 단위 스냅

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${pad2(h)}:${pad2(m)}`
}

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function snapMins(mins: number): number {
  return Math.round(mins / SNAP) * SNAP
}

// ── 그리드 공통 헬퍼 (월간·주간 공용) ──────────────────────
function evtLeftPct(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${Math.max((h - G_START + m / 60) / G_HOURS * 100, 0)}%`
}
function evtWidthPct(s: string, e: string) {
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  return `${Math.max(((eh + em / 60) - (sh + sm / 60)) / G_HOURS * 100 - 0.2, 1)}%`
}

function MonthGridView({
  schedules, staffs, staffColorMap, year, month, onEdit, onCreate, onMove, onResize,
}: {
  schedules:     LocalSchedule[]
  staffs:        StaffBasic[]
  staffColorMap: Map<string, typeof COLOR_PALETTE[0]>
  year:          number
  month:         number
  onEdit:        (s: LocalSchedule) => void
  onCreate:      (date: string) => void
  onMove:        (id: string, newDate: string, newStart: string, newEnd: string) => void
  onResize:      (id: string, date: string, newStart: string, newEnd: string) => void
}) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthPfx    = `${year}-${pad2(month)}`
  const hours       = Array.from({ length: G_HOURS }, (_, i) => G_START + i)
  const dayNums     = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const minW        = DATE_LBL_W + G_HOURS * T_COL_W

  const byDay = useMemo(() => {
    const map = new Map<number, LocalSchedule[]>()
    for (const s of schedules) {
      if (!s.date.startsWith(monthPfx)) continue
      const d = parseInt(s.date.slice(8, 10))
      map.set(d, [...(map.get(d) ?? []), s])
    }
    return map
  }, [schedules, monthPfx])

  const maxEvts = Math.max(1, ...dayNums.map(d => (byDay.get(d) ?? []).length))
  const ROW_H   = maxEvts * (EVT_H + 2) + 6

  // ── Drag 상태 ──
  const outerRef  = useRef<HTMLDivElement>(null)
  const innerRef  = useRef<HTMLDivElement>(null)
  const dragRef   = useRef<MGDragState | null>(null)
  const cbRef     = useRef({ onEdit, onCreate, onMove, onResize })
  useEffect(() => { cbRef.current = { onEdit, onCreate, onMove, onResize } },
    [onEdit, onCreate, onMove, onResize])
  const [dragPreview, setDragPreview] = useState<MGPreview | null>(null)

  // 전역 mousemove / mouseup
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current
      if (!drag) return
      e.preventDefault()

      const dx = e.clientX - drag.initX
      const dy = e.clientY - drag.initY
      if (!drag.hasDragged && Math.sqrt(dx * dx + dy * dy) > 4) {
        drag.hasDragged = true
      }
      if (!drag.hasDragged) return

      const { type, schedule, timeAreaLeft, timeAreaWidth, initDayIdx, rowH, durH } = drag

      // X 델타 → 시간 델타 (분 단위, 스냅)
      const rawDeltaMins = dx / timeAreaWidth * G_HOURS * 60
      const deltaMins    = snapMins(rawDeltaMins)

      if (type === 'move') {
        // 시작 시간 = 원본 + delta, 종료 = 시작 + duration
        const origStartMins = timeToMins(schedule.startTime)
        const origEndMins   = timeToMins(schedule.endTime)
        const durationMins  = origEndMins - origStartMins
        const maxStartMins  = G_END * 60 - durationMins
        const newStartMins  = Math.max(G_START * 60, Math.min(maxStartMins, snapMins(origStartMins + deltaMins)))
        const newEndMins    = newStartMins + durationMins
        const newStart = minsToTime(newStartMins)
        const newEnd   = minsToTime(newEndMins)

        // Y 델타 → 날짜 변경
        const dayDelta   = Math.round(dy / rowH)
        const newDayIdx  = Math.max(0, Math.min(daysInMonth - 1, initDayIdx + dayDelta))
        const newDay     = dayNums[newDayIdx]
        const newDate    = `${year}-${pad2(month)}-${pad2(newDay)}`

        drag.previewDate  = newDate
        drag.previewStart = newStart
        drag.previewEnd   = newEnd
        setDragPreview({ scheduleId: schedule.id, type, previewDate: newDate, previewStart: newStart, previewEnd: newEnd })

      } else if (type === 'resizeStart') {
        const origStartMins = timeToMins(schedule.startTime)
        const origEndMins   = timeToMins(schedule.endTime)
        const newStartMins  = Math.max(G_START * 60, Math.min(origEndMins - SNAP, snapMins(origStartMins + deltaMins)))
        const newStart = minsToTime(newStartMins)
        drag.previewStart = newStart
        setDragPreview(p => p ? { ...p, previewStart: newStart } : null)

      } else {
        const origStartMins = timeToMins(schedule.startTime)
        const origEndMins   = timeToMins(schedule.endTime)
        const newEndMins    = Math.max(origStartMins + SNAP, Math.min(G_END * 60, snapMins(origEndMins + deltaMins)))
        const newEnd = minsToTime(newEndMins)
        drag.previewEnd = newEnd
        setDragPreview(p => p ? { ...p, previewEnd: newEnd } : null)
      }
    }

    function onMouseUp() {
      const drag = dragRef.current
      if (!drag) return

      if (!drag.hasDragged) {
        // 클릭으로 처리 → 모달 열기
        cbRef.current.onEdit(drag.schedule)
      } else {
        const { schedule, type, previewDate, previewStart, previewEnd } = drag
        const changed = previewDate !== schedule.date
          || previewStart !== schedule.startTime
          || previewEnd   !== schedule.endTime
        if (changed) {
          if (type === 'move') cbRef.current.onMove(schedule.id, previewDate, previewStart, previewEnd)
          else cbRef.current.onResize(schedule.id, previewDate, previewStart, previewEnd)
        }
      }
      dragRef.current = null
      setDragPreview(null)
    }

    window.addEventListener('mousemove', onMouseMove, { passive: false })
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [daysInMonth, year, month])

  function startDrag(s: LocalSchedule, type: MGDragType, e: React.MouseEvent, dayIdx: number) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const outerRect      = outer.getBoundingClientRect()
    const timeAreaLeft   = outerRect.left + DATE_LBL_W - outer.scrollLeft
    const timeAreaWidth  = inner.offsetWidth - DATE_LBL_W
    const [sh, sm] = s.startTime.split(':').map(Number)
    const [eh, em] = s.endTime.split(':').map(Number)
    const durH = (eh + em / 60) - (sh + sm / 60)

    dragRef.current = {
      type, schedule: s,
      initX: e.clientX, initY: e.clientY,
      initDayIdx: dayIdx,
      timeAreaLeft, timeAreaWidth,
      rowH: ROW_H, durH,
      hasDragged: false,
      previewDate:  s.date,
      previewStart: s.startTime,
      previewEnd:   s.endTime,
    }
    setDragPreview({
      scheduleId: s.id, type,
      previewDate: s.date, previewStart: s.startTime, previewEnd: s.endTime,
    })
  }

  return (
    <div ref={outerRef} style={{ overflowX: 'auto', userSelect: dragPreview ? 'none' : undefined }} className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div ref={innerRef} style={{ minWidth: minW }}>

        {/* ── 시간 헤더 ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e7e5e4',
                      backgroundColor: '#fafaf9', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ width: DATE_LBL_W, flexShrink: 0, borderRight: '1px solid #e7e5e4' }} />
          {hours.map(h => (
            <div key={h} style={{ flex: 1, minWidth: T_COL_W }}
                 className="border-r border-stone-100 text-center py-2 text-[10px] font-semibold text-stone-500">
              {pad2(h)}:00
            </div>
          ))}
        </div>

        {/* ── 날짜 행들 ── */}
        {dayNums.map((d, dayIdx) => {
          const dateStr = `${year}-${pad2(month)}-${pad2(d)}`
          const evts    = byDay.get(d) ?? []
          const dow     = new Date(year, month - 1, d).getDay()

          // 이 행으로 이동 중인 크로스-날짜 ghost
          const ghost = (dragPreview?.type === 'move'
            && dragPreview.previewDate === dateStr
            && dragPreview.previewDate !== schedules.find(s => s.id === dragPreview.scheduleId)?.date)
            ? dragPreview : null

          const ghostSchedule = ghost
            ? schedules.find(s => s.id === ghost.scheduleId) : null

          return (
            <div key={d} style={{ display: 'flex', borderBottom: '1px solid #f5f5f4' }}>
              {/* 날짜 레이블 */}
              <div
                style={{ width: DATE_LBL_W, flexShrink: 0, height: ROW_H, borderRight: '1px solid #e7e5e4',
                         position: 'sticky', left: 0, zIndex: 2 }}
                className={`flex flex-col items-center justify-center gap-0.5 ${
                  dow === 0 ? 'bg-red-50'
                  : dow === 6 ? 'bg-sky-50'
                  : 'bg-white'
                }`}
              >
                <span className={`text-[10px] font-semibold ${dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-stone-400'}`}>
                  {['일','월','화','수','목','금','토'][dow]}
                </span>
                <span className={`text-sm font-bold ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-stone-700'}`}>
                  {d}
                </span>
              </div>

              {/* 시간 영역 */}
              <div
                style={{ flex: 1, minWidth: G_HOURS * T_COL_W, position: 'relative',
                         height: ROW_H, cursor: dragPreview ? 'grabbing' : 'pointer' }}
                className={dow === 0 ? 'bg-red-50/20' : dow === 6 ? 'bg-blue-50/20' : 'hover:bg-stone-50/40'}
                onClick={() => { if (!dragPreview) onCreate(dateStr) }}
              >
                {/* 수직 시간선 */}
                {hours.map((_, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: `${i / G_HOURS * 100}%`,
                    top: 0, bottom: 0, borderRight: '1px solid rgba(245,245,244,0.9)', pointerEvents: 'none',
                  }} />
                ))}

                {/* 이벤트 블록 */}
                {evts.map((s, idx) => {
                  const c       = staffColorMap.get(s.staffId) ?? COLOR_PALETTE[0]
                  const sName   = staffs.find(st => st.id === s.staffId)?.name ?? ''
                  const top     = 3 + idx * (EVT_H + 2)

                  // 드래그 중이면 preview 값 사용
                  const isActive = dragPreview?.scheduleId === s.id
                  const isCrossDate = isActive && dragPreview!.previewDate !== s.date
                  const dispStart = isActive ? dragPreview!.previewStart : s.startTime
                  const dispEnd   = isActive ? dragPreview!.previewEnd   : s.endTime
                  const [dsh, dsm] = dispStart.split(':').map(Number)
                  const [deh, dem] = dispEnd.split(':').map(Number)
                  const durH = (deh + dem / 60) - (dsh + dsm / 60)

                  return (
                    <div
                      key={s.id}
                      style={{
                        position: 'absolute',
                        left:    isCrossDate ? evtLeftPct(s.startTime) : evtLeftPct(dispStart),
                        width:   isCrossDate ? evtWidthPct(s.startTime, s.endTime) : evtWidthPct(dispStart, dispEnd),
                        top,
                        height:  EVT_H,
                        opacity: isCrossDate ? 0.3 : 1,
                        cursor:  'grab',
                        zIndex:  isActive ? 5 : undefined,
                      }}
                      onMouseDown={e => startDrag(s, 'move', e, dayIdx)}
                      title={`${sName}  ${s.startTime}–${s.endTime}`}
                    >
                      {/* 왼쪽 resize 핸들 */}
                      <div
                        style={{ position: 'absolute', left: 0, top: 0, width: 7, height: '100%',
                                 cursor: 'ew-resize', zIndex: 2 }}
                        onMouseDown={e => { e.stopPropagation(); startDrag(s, 'resizeStart', e, dayIdx) }}
                      />
                      {/* 오른쪽 resize 핸들 */}
                      <div
                        style={{ position: 'absolute', right: 0, top: 0, width: 7, height: '100%',
                                 cursor: 'ew-resize', zIndex: 2 }}
                        onMouseDown={e => { e.stopPropagation(); startDrag(s, 'resizeEnd', e, dayIdx) }}
                      />
                      {/* 시각적 컨텐츠 */}
                      <div style={{
                        position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
                        backgroundColor: c.bg, color: c.text,
                        borderLeft: `3px solid ${c.dot}`,
                        borderRadius: 2, overflow: 'hidden',
                        pointerEvents: 'none',
                      }} className="text-[9px] font-bold px-1 flex items-center gap-0.5 leading-none">
                        <span>{sName.slice(0, 3)}</span>
                        {durH >= 1.5 && <span className="opacity-60 font-normal text-[8px]">{dispStart}–{dispEnd}</span>}
                      </div>
                    </div>
                  )
                })}

                {/* 크로스-날짜 이동 ghost */}
                {ghost && ghostSchedule && (() => {
                  const c     = staffColorMap.get(ghostSchedule.staffId) ?? COLOR_PALETTE[0]
                  const sName = staffs.find(st => st.id === ghostSchedule.staffId)?.name ?? ''
                  const top   = 3 + evts.length * (EVT_H + 2)
                  const [gh, gm] = ghost.previewStart.split(':').map(Number)
                  const [ge, gem] = ghost.previewEnd.split(':').map(Number)
                  const durH = (ge + gem / 60) - (gh + gm / 60)
                  return (
                    <div
                      key="ghost"
                      style={{
                        position: 'absolute',
                        left:   evtLeftPct(ghost.previewStart),
                        width:  evtWidthPct(ghost.previewStart, ghost.previewEnd),
                        top, height: EVT_H,
                        backgroundColor: c.bg, color: c.text,
                        borderLeft: `3px solid ${c.dot}`,
                        borderRadius: 2, overflow: 'hidden',
                        opacity: 0.7, pointerEvents: 'none',
                        outline: `2px dashed ${c.dot}`,
                        zIndex: 5,
                      }}
                      className="text-[9px] font-bold px-1 flex items-center gap-0.5 leading-none"
                    >
                      <span>{sName.slice(0, 3)}</span>
                      {durH >= 1.5 && <span className="opacity-60 font-normal text-[8px]">{ghost.previewStart}–{ghost.previewEnd}</span>}
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })}

      </div>
    </div>
  )
}


// ── 주간 그리드 뷰 ────────────────────────────────────────
// 레이아웃: row = 요일(월~일), column = 시간(왼→오른)
// 월간 그리드와 동일한 구조, 7행 고정

const DOW_KO = ['월', '화', '수', '목', '금', '토', '일']

function WeekGridView({
  schedules, staffs, staffColorMap, weekStart, onEdit, onCreate, isAdmin,
}: {
  schedules:     LocalSchedule[]
  staffs:        StaffBasic[]
  staffColorMap: Map<string, typeof COLOR_PALETTE[0]>
  weekStart:     Date
  onEdit:        (s: LocalSchedule) => void
  onCreate:      (date: string) => void
  isAdmin:       boolean
}) {
  const days  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const hours = Array.from({ length: G_HOURS }, (_, i) => G_START + i)
  const minW  = DATE_LBL_W + G_HOURS * T_COL_W

  const byDate = useMemo(() => {
    const map = new Map<string, LocalSchedule[]>()
    for (const s of schedules) {
      const arr = map.get(s.date) ?? []
      arr.push(s)
      map.set(s.date, arr)
    }
    return map
  }, [schedules])

  const maxEvts = Math.max(1, ...days.map(d => (byDate.get(format(d, 'yyyy-MM-dd')) ?? []).length))
  const ROW_H   = maxEvts * (EVT_H + 2) + 6

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: minW }}>
          {/* 시간 헤더 */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e7e5e4',
                        backgroundColor: '#fafaf9', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ width: DATE_LBL_W, flexShrink: 0, borderRight: '1px solid #e7e5e4' }}
                 className="flex items-center justify-center py-2">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-stone-400">시간대</span>
            </div>
            {hours.map(h => (
              <div key={h} style={{ flex: 1, minWidth: T_COL_W }}
                   className="border-r border-stone-100 text-center py-2 text-[10px] font-semibold text-stone-500">
                {pad2(h)}:00
              </div>
            ))}
          </div>

          {/* 7 요일 행 */}
          {days.map((day, idx) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const evts    = byDate.get(dateStr) ?? []
            const isSun   = idx === 6
            const isSat   = idx === 5

            return (
              <div key={dateStr} style={{ display: 'flex', borderBottom: '1px solid #f5f5f4' }}>
                {/* 요일 레이블 */}
                <div
                  style={{ width: DATE_LBL_W, flexShrink: 0, height: ROW_H, borderRight: '1px solid #e7e5e4',
                           position: 'sticky', left: 0, zIndex: 2 }}
                  className={`flex flex-col items-center justify-center gap-0.5 ${
                    isSun ? 'bg-red-50' : isSat ? 'bg-sky-50' : 'bg-white'
                  }`}
                >
                  <span className={`text-[10px] font-semibold ${
                    isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-stone-400'
                  }`}>
                    {DOW_KO[idx]}
                  </span>
                  <span className={`text-sm font-bold ${
                    isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-stone-700'
                  }`}>
                    {format(day, 'd')}
                  </span>
                </div>

                {/* 시간 영역 */}
                <div
                  style={{ flex: 1, minWidth: G_HOURS * T_COL_W, position: 'relative',
                           height: ROW_H, cursor: isAdmin ? 'pointer' : 'default' }}
                  className={isSun ? 'bg-red-50/20' : isSat ? 'bg-blue-50/20' : 'hover:bg-stone-50/40'}
                  onClick={() => { if (isAdmin) onCreate(dateStr) }}
                >
                  {/* 수직 시간선 */}
                  {hours.map((_, i) => (
                    <div key={i} style={{
                      position: 'absolute', left: `${i / G_HOURS * 100}%`,
                      top: 0, bottom: 0, borderRight: '1px solid rgba(245,245,244,0.9)',
                      pointerEvents: 'none',
                    }} />
                  ))}

                  {/* 이벤트 블록 */}
                  {evts.map((s, evtIdx) => {
                    const c     = staffColorMap.get(s.staffId) ?? COLOR_PALETTE[0]
                    const sName = staffs.find(st => st.id === s.staffId)?.name ?? ''
                    const top   = 3 + evtIdx * (EVT_H + 2)
                    const [sh, sm] = s.startTime.split(':').map(Number)
                    const [eh, em] = s.endTime.split(':').map(Number)
                    const durH = (eh + em / 60) - (sh + sm / 60)

                    return (
                      <div
                        key={s.id}
                        style={{
                          position: 'absolute',
                          left:   evtLeftPct(s.startTime),
                          width:  evtWidthPct(s.startTime, s.endTime),
                          top, height: EVT_H,
                          cursor: isAdmin ? 'pointer' : 'default',
                        }}
                        onClick={e => { e.stopPropagation(); if (isAdmin) onEdit(s) }}
                        title={`${sName}  ${s.startTime}–${s.endTime}`}
                      >
                        <div style={{
                          position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
                          backgroundColor: c.bg, color: c.text,
                          borderLeft: `3px solid ${c.dot}`,
                          borderRadius: 2, overflow: 'hidden', pointerEvents: 'none',
                        }} className="text-[9px] font-bold px-1 flex items-center gap-0.5 leading-none">
                          <span>{sName.slice(0, 3)}</span>
                          {durH >= 1.5 && <span className="opacity-60 font-normal text-[8px]">{s.startTime}–{s.endTime}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
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

// ── CSV 파싱 ────────────────────────────────────────────

interface ParsedRow {
  date:          string
  staffId:       string
  staffName:     string
  startTime:     string
  endTime:       string
  shiftType:     ShiftType
  recordedHours: number
}

interface ParseError {
  line: number
  raw:  string
  msg:  string
}

function normalizeTime(t: string): string {
  const [h, m = '00'] = t.split(':')
  return `${String(Number(h)).padStart(2, '0')}:${m.padStart(2, '0')}`
}

function inferShiftType(start: string): ShiftType {
  return start < '11:00' ? '오픈' : start < '14:00' ? '미들' : '마감'
}

function parseScheduleCSV(
  text: string,
  staffs: StaffBasic[],
): { rows: ParsedRow[]; errors: ParseError[] } {
  const rows: ParsedRow[] = []
  const errors: ParseError[] = []

  text.split('\n').forEach((raw, i) => {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) return

    const cols = trimmed.split(/\s+/)
    if (cols.length < 4) {
      errors.push({ line: i + 1, raw, msg: '컬럼 부족 (날짜 이름 시작 종료 필요)' })
      return
    }

    const [dateCol, nameCol, startCol, endCol] = cols

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateCol)) {
      errors.push({ line: i + 1, raw, msg: `날짜 형식 오류: ${dateCol}` })
      return
    }

    const staff = staffs.find(s => s.name === nameCol)
    if (!staff) {
      errors.push({ line: i + 1, raw, msg: `직원을 찾을 수 없음: ${nameCol}` })
      return
    }

    let startTime: string, endTime: string
    try {
      startTime = normalizeTime(startCol)
      endTime   = normalizeTime(endCol)
    } catch {
      errors.push({ line: i + 1, raw, msg: '시간 형식 오류' })
      return
    }

    if (startTime >= endTime) {
      errors.push({ line: i + 1, raw, msg: '종료 시간이 시작 시간보다 빨라야 합니다' })
      return
    }

    rows.push({
      date:          dateCol,
      staffId:       staff.id,
      staffName:     staff.name,
      startTime,
      endTime,
      shiftType:     inferShiftType(startTime),
      recordedHours: timeToHours(startTime, endTime),
    })
  })

  return { rows, errors }
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

  const [showImport,     setShowImport]     = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [importText,     setImportText]     = useState('')
  const [importLoading,  setImportLoading]  = useState(false)
  const [bulkFrom,       setBulkFrom]       = useState('')
  const [bulkTo,         setBulkTo]         = useState('')
  const [bulkLoading,    setBulkLoading]    = useState(false)
  const [filterStaffId, setFilterStaffId] = useState<string | null>(null)

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

  const importResult = useMemo(
    () => parseScheduleCSV(importText, staffs),
    [importText, staffs],
  )

  const bulkDeleteCount = useMemo(
    () => (bulkFrom && bulkTo)
      ? schedules.filter(s => s.date >= bulkFrom && s.date <= bulkTo).length
      : 0,
    [schedules, bulkFrom, bulkTo],
  )

  const filteredEvents = useMemo<CalEvent[]>(
    () => filterStaffId ? events.filter(e => e.resource.staffId === filterStaffId) : events,
    [events, filterStaffId],
  )

  const filteredSchedules = useMemo(
    () => filterStaffId ? schedules.filter(s => s.staffId === filterStaffId) : schedules,
    [schedules, filterStaffId],
  )

  const monthStats = useMemo(() => {
    const year     = calDate.getFullYear()
    const month    = calDate.getMonth() + 1
    const monthPfx = `${year}-${String(month).padStart(2, '0')}`
    return staffs.map(staff => {
      const rows  = schedules.filter(s => s.staffId === staff.id && s.date.startsWith(monthPfx))
      const hours = rows.reduce((acc, s) => acc + timeToHours(s.startTime, s.endTime), 0)
      return { staff, hours, count: rows.length }
    })
  }, [calDate, schedules, staffs])

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
    if (!isAdmin) return
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
    if (!isAdmin) return
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

  async function handleCSVImport() {
    if (!importResult.rows.length) return
    setImportLoading(true)
    const payload = importResult.rows.map(r => ({
      staff_id:       r.staffId,
      date:           r.date,
      shift_type:     r.shiftType,
      start_time:     r.startTime,
      end_time:       r.endTime,
      recorded_hours: r.recordedHours,
      note:           '',
    }))
    const { data } = await supabase.from('schedules').insert(payload).select()
    if (data) {
      const inserted = data as Array<{
        id: string; staff_id: string; date: string
        shift_type: string; note: string | null
      }>
      const newRows: LocalSchedule[] = inserted.map((row, i) => ({
        id:        row.id,
        staffId:   row.staff_id,
        date:      row.date,
        shiftType: row.shift_type as ShiftType,
        startTime: importResult.rows[i].startTime,
        endTime:   importResult.rows[i].endTime,
        note:      row.note ?? '',
      }))
      setSchedules(prev => [...prev, ...newRows])
    }
    setImportLoading(false)
    setShowImport(false)
    setImportText('')
  }

  async function handleBulkDelete() {
    if (!bulkFrom || !bulkTo || bulkDeleteCount === 0) return
    setBulkLoading(true)
    await supabase.from('schedules').delete().gte('date', bulkFrom).lte('date', bulkTo)
    setSchedules(prev => prev.filter(s => s.date < bulkFrom || s.date > bulkTo))
    setBulkLoading(false)
    setShowBulkDelete(false)
    setBulkFrom('')
    setBulkTo('')
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
    if (!isAdmin) return
    setForm({ staffId: s.staffId, shiftType: s.shiftType, startTime: s.startTime, endTime: s.endTime, note: s.note })
    setModal({ mode: 'edit', schedule: s })
  }
  function onMonthCreate(date: string) {
    if (!isAdmin) return
    setForm({
      staffId:   staffs.find(s => s.is_active)?.id ?? '',
      shiftType: '오픈',
      startTime: shiftDefaults['오픈'].start,
      endTime:   shiftDefaults['오픈'].end,
      note:      '',
    })
    setModal({ mode: 'create', date })
  }

  // ── 주간 DnD 핸들러 ─────────────────────────────────────

  const onEventDrop = useCallback(async ({ event, start, end }: {
    event: CalEvent; start: Date | string; end: Date | string
  }) => {
    if (!isAdmin) return
    const s = event.resource
    const st = start instanceof Date ? start : new Date(start)
    const en = end   instanceof Date ? end   : new Date(end)
    const newDate  = format(st, 'yyyy-MM-dd')
    const newStart = format(st, 'HH:mm')
    const newEnd   = format(en, 'HH:mm')
    const newShiftType   = inferShiftType(newStart)
    const recorded_hours = timeToHours(newStart, newEnd)
    await supabase.from('schedules').update({
      date: newDate, start_time: newStart, end_time: newEnd,
      shift_type: newShiftType, recorded_hours,
    }).eq('id', s.id)
    setSchedules(prev => prev.map(sc => sc.id === s.id
      ? { ...sc, date: newDate, startTime: newStart, endTime: newEnd, shiftType: newShiftType }
      : sc))
  }, [isAdmin])

  const onEventResize = useCallback(async ({ event, start, end }: {
    event: CalEvent; start: Date | string; end: Date | string
  }) => {
    if (!isAdmin) return
    const s = event.resource
    const st = start instanceof Date ? start : new Date(start)
    const en = end   instanceof Date ? end   : new Date(end)
    const newDate  = format(st, 'yyyy-MM-dd')
    const newStart = format(st, 'HH:mm')
    const newEnd   = format(en, 'HH:mm')
    const newShiftType   = inferShiftType(newStart)
    const recorded_hours = timeToHours(newStart, newEnd)
    await supabase.from('schedules').update({
      date: newDate, start_time: newStart, end_time: newEnd,
      shift_type: newShiftType, recorded_hours,
    }).eq('id', s.id)
    setSchedules(prev => prev.map(sc => sc.id === s.id
      ? { ...sc, date: newDate, startTime: newStart, endTime: newEnd, shiftType: newShiftType }
      : sc))
  }, [isAdmin])

  // ── 월간 DnD 핸들러 ─────────────────────────────────────

  const handleMonthMove = useCallback(async (
    id: string, newDate: string, newStart: string, newEnd: string
  ) => {
    if (!isAdmin) return
    const newShiftType   = inferShiftType(newStart)
    const recorded_hours = timeToHours(newStart, newEnd)
    await supabase.from('schedules').update({
      date: newDate, start_time: newStart, end_time: newEnd,
      shift_type: newShiftType, recorded_hours,
    }).eq('id', id)
    setSchedules(prev => prev.map(s => s.id === id
      ? { ...s, date: newDate, startTime: newStart, endTime: newEnd, shiftType: newShiftType }
      : s))
  }, [isAdmin])

  const handleMonthResize = useCallback(async (
    id: string, _date: string, newStart: string, newEnd: string
  ) => {
    if (!isAdmin) return
    const newShiftType   = inferShiftType(newStart)
    const recorded_hours = timeToHours(newStart, newEnd)
    await supabase.from('schedules').update({
      start_time: newStart, end_time: newEnd,
      shift_type: newShiftType, recorded_hours,
    }).eq('id', id)
    setSchedules(prev => prev.map(s => s.id === id
      ? { ...s, startTime: newStart, endTime: newEnd, shiftType: newShiftType }
      : s))
  }, [isAdmin])

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
        <div className="mb-4 space-y-2">

          {/* 1행: 제목 + 뷰 토글 */}
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-stone-800">근무표</h1>
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
          </div>

          {/* 관리자 버튼 행 */}
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowStaffMgr(true)}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-600 shadow-sm hover:bg-stone-50 active:scale-95"
              >
                직원 관리
              </button>
              <button
                onClick={() => { setImportText(''); setShowImport(true) }}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-600 shadow-sm hover:bg-stone-50 active:scale-95"
              >
                CSV 가져오기
              </button>
              <button
                onClick={() => setShowBulkDelete(true)}
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-100 active:scale-95"
              >
                일정 삭제
              </button>
            </div>
          )}

          {/* 2행: 이동 + 날짜 레이블 + 이번주/달 + 시간설정 */}
          <div className="flex items-center gap-2">
            <button onClick={goBack} className="shrink-0 rounded-xl border border-stone-200 bg-white p-2 text-stone-500 shadow-sm hover:bg-stone-50 active:scale-90">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div className="flex-1 min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-center shadow-sm">
              <span className="text-sm font-semibold text-stone-700 truncate">{navLabel}</span>
            </div>
            <button onClick={goForward} className="shrink-0 rounded-xl border border-stone-200 bg-white p-2 text-stone-500 shadow-sm hover:bg-stone-50 active:scale-90">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            <button
              onClick={() => setCalDate(new Date())}
              className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-100 active:scale-95"
            >
              {view === 'week' ? '이번 주' : '이번 달'}
            </button>
            {isAdmin && <button
              onClick={() => setShowSettings(v => !v)}
              title="시간 설정"
              className={`shrink-0 rounded-xl border p-2 shadow-sm transition-colors active:scale-95 ${
                showSettings ? 'border-stone-400 bg-stone-700 text-white' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>}
          </div>
        </div>

        {/* ── 시간 설정 패널 ── */}
        {isAdmin && showSettings && (
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

        {/* ── 직원 범례 (클릭 → 필터) ── */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {staffs.map((staff, i) => {
            const c        = staffColorMap.get(staff.id) ?? COLOR_PALETTE[i % COLOR_PALETTE.length]
            const selected = filterStaffId === staff.id
            const dimmed   = filterStaffId !== null && !selected
            return (
              <button
                key={staff.id}
                onClick={() => setFilterStaffId(prev => prev === staff.id ? null : staff.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-all active:scale-95 ${
                  selected ? 'ring-2 shadow-sm scale-105' : 'hover:opacity-80'
                } ${dimmed ? 'opacity-30' : ''}`}
                style={{ backgroundColor: c.bg, color: c.text } as React.CSSProperties}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />
                {staff.name}
              </button>
            )
          })}
          {filterStaffId !== null && (
            <button
              onClick={() => setFilterStaffId(null)}
              className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-500 hover:bg-stone-200 active:scale-95"
            >
              전체 보기
            </button>
          )}
        </div>

        {/* ── 뷰 영역 ── */}
        {view === 'week' ? (
          <>
            <WeekGridView
              schedules={filteredSchedules}
              staffs={staffs}
              staffColorMap={staffColorMap}
              weekStart={startOfWeek(calDate, { weekStartsOn: 1 })}
              onEdit={onMonthEdit}
              onCreate={onMonthCreate}
              isAdmin={isAdmin}
            />

            {/* ── 이번 주 배정 시간 통계 ── */}
            {isAdmin && <div className="mt-5 rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
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
            </div>}
          </>
        ) : (
          <>
            <MonthGridView
              schedules={filteredSchedules}
              staffs={staffs}
              staffColorMap={staffColorMap}
              year={calDate.getFullYear()}
              month={calDate.getMonth() + 1}
              onEdit={onMonthEdit}
              onCreate={onMonthCreate}
              onMove={handleMonthMove}
              onResize={handleMonthResize}
            />

            {/* ── 이번 달 배정 현황 ── */}
            {isAdmin && <div className="mt-5 rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-stone-100 bg-stone-50 px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-stone-700">이번 달 배정 현황</span>
                <span className="text-xs text-stone-400">{monthLabel}</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-stone-100 sm:grid-cols-4 lg:grid-cols-7">
                {monthStats.map(({ staff, hours, count }) => {
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
                  총 <span className="font-bold text-stone-700">{monthStats.reduce((a, s) => a + s.hours, 0)}h</span> ·{' '}
                  <span className="font-bold text-stone-700">{monthStats.reduce((a, s) => a + s.count, 0)}회</span> 배정
                </span>
              </div>
            </div>}
          </>
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

      {/* ── CSV 가져오기 모달 ── */}
      {showImport && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setShowImport(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-stone-100 px-6 pb-4 pt-6">
                <div>
                  <h2 className="text-lg font-bold text-stone-800">CSV 가져오기</h2>
                  <p className="mt-0.5 text-xs text-stone-400">날짜 이름 시작시간 종료시간 순서 (탭·공백 구분)</p>
                </div>
                <button onClick={() => setShowImport(false)} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-6 py-4">
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  rows={6}
                  placeholder={"2026-06-15\t카렌\t9:30\t16:00\n2026-06-15\t준식\t12:00\t18:00"}
                  className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-mono text-sm text-stone-700 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {importText.trim() && (
                <div className="flex-1 space-y-1 overflow-y-auto px-6 pb-4">
                  {importResult.rows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs">
                      <span className="font-semibold text-emerald-700">{r.date}</span>
                      <span className="text-emerald-600">{r.staffName}</span>
                      <span className="text-emerald-500">{r.startTime}–{r.endTime}</span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${SHIFT_BADGE[r.shiftType]}`}>
                        {r.shiftType}
                      </span>
                    </div>
                  ))}
                  {importResult.errors.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs">
                      <span className="font-semibold text-red-500">줄 {e.line}</span>
                      <span className="truncate text-red-400">{e.msg}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-6 py-4">
                <span className="text-xs text-stone-400">
                  유효 <span className="font-bold text-emerald-600">{importResult.rows.length}</span>건
                  {importResult.errors.length > 0 && (
                    <span> · 오류 <span className="font-bold text-red-500">{importResult.errors.length}</span>건</span>
                  )}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowImport(false)}
                    className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleCSVImport}
                    disabled={importResult.rows.length === 0 || importLoading}
                    className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {importLoading ? '가져오는 중...' : `${importResult.rows.length}건 가져오기`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 일정 일괄 삭제 모달 ── */}
      {showBulkDelete && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setShowBulkDelete(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="w-full max-w-sm rounded-2xl bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-stone-100 px-6 pb-4 pt-6">
                <h2 className="text-lg font-bold text-stone-800">일정 일괄 삭제</h2>
                <button onClick={() => setShowBulkDelete(false)} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-400">시작 날짜</label>
                  <input
                    type="date"
                    value={bulkFrom}
                    onChange={e => setBulkFrom(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-400">종료 날짜</label>
                  <input
                    type="date"
                    value={bulkTo}
                    min={bulkFrom}
                    onChange={e => setBulkTo(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                {bulkFrom && bulkTo && (
                  <div className={`rounded-xl px-4 py-3 text-sm ${bulkDeleteCount > 0 ? 'bg-red-50 text-red-700' : 'bg-stone-50 text-stone-500'}`}>
                    {bulkDeleteCount > 0
                      ? <><span className="font-bold">{bulkDeleteCount}건</span>의 스케줄이 삭제됩니다.</>
                      : '해당 기간에 스케줄이 없습니다.'}
                  </div>
                )}
              </div>

              <div className="flex gap-2 px-6 pb-6">
                <button
                  onClick={() => { setShowBulkDelete(false); setBulkFrom(''); setBulkTo('') }}
                  className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50"
                >
                  취소
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteCount === 0 || bulkLoading || !bulkFrom || !bulkTo}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {bulkLoading ? '삭제 중...' : `${bulkDeleteCount}건 삭제`}
                </button>
              </div>
            </div>
          </div>
        </>
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
