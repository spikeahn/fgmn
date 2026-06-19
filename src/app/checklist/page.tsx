'use client'

import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/contexts/AdminContext'
import type { ChecklistTab } from '@/types/database'
import { StaffModal } from '@/components/StaffModal'
import type { StaffItem } from '@/components/StaffModal'

const PAGE_SIZE = 5
const WEEKDAYS  = ['월', '화', '수', '목', '금', '토', '일']

// ── 로컬 타입 ─────────────────────────────────────────────

interface CompletionInfo { staffName: string; time: string }

interface LocalItem {
  id: string
  tab: ChecklistTab
  order: number
  title: string
  description: string | null
  is_active: boolean
  start_date: string | null
  imageDataUrl?: string
}

type LocalStaff = StaffItem

// ── 날짜 유틸 ─────────────────────────────────────────────

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDate(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

function buildCalendarGrid(year: number, month: number): (string | null)[] {
  const pad  = (new Date(year, month, 1).getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = Array(pad).fill(null)
  for (let d = 1; d <= days; d++)
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

// ── 아이콘 ────────────────────────────────────────────────

function ChevronLeft()  { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg> }
function ChevronRight() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg> }
function CheckIcon()    { return <svg className="h-4 w-4 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> }
function CameraIcon()   { return <svg className="h-6 w-6 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg> }

// ── 메인 페이지 ───────────────────────────────────────────

export default function ChecklistPage() {
  const { isAdmin } = useAdmin()
  const today = localDateStr()

  // ── 데이터 ──────────────────────────────────────────────
  const [items,      setItems]      = useState<LocalItem[]>([])
  const [staffList,  setStaffList]  = useState<LocalStaff[]>([])
  const [logs,       setLogs]       = useState<Map<string, CompletionInfo>>(new Map())
  const [logDates,   setLogDates]   = useState<Set<string>>(new Set())
  const [loading,    setLoading]    = useState(true)
  const [dbError,    setDbError]    = useState<string | null>(null)

  // ── 뷰 ──────────────────────────────────────────────────
  const [activeTab,       setActiveTab]       = useState<ChecklistTab>('오픈')
  const [selectedDate,    setSelectedDate]    = useState(today)
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [page,            setPage]            = useState(1)
  const [saving,          setSaving]          = useState<string | null>(null)
  const [editMode,        setEditMode]        = useState(false)
  const [deletingId,      setDeletingId]      = useState<string | null>(null)

  // ── 달력 팝업 ───────────────────────────────────────────
  const [showCal,  setShowCal]  = useState(false)
  const [calYear,  setCalYear]  = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())

  // ── 모달 ────────────────────────────────────────────────
  const [editingItem,  setEditingItem]  = useState<LocalItem | 'new' | null>(null)
  const [showStaffMgr, setShowStaffMgr] = useState(false)
  const [editingStaff, setEditingStaff] = useState<LocalStaff | 'new' | null>(null)

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  // 관리자 로그아웃 시 직원 관리 닫기
  useEffect(() => { if (!isAdmin) setShowStaffMgr(false) }, [isAdmin])

  // ── 초기 로드: 직원 + 체크리스트 ───────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true)
      setDbError(null)
      const [staffRes, clRes] = await Promise.all([
        supabase.from('staffs').select('*').order('name'),
        supabase.from('checklists').select('*').eq('is_active', true).order('order'),
      ])
      if (staffRes.error || clRes.error) {
        setDbError(`staffs: ${staffRes.error?.message ?? 'ok'} / checklists: ${clRes.error?.message ?? 'ok'}`)
        setLoading(false)
        return
      }
      if (staffRes.data) {
        setStaffList(staffRes.data as LocalStaff[])
        const active = (staffRes.data as LocalStaff[]).filter(s => s.is_active)
        if (active.length) setSelectedStaffId(active[0].id)
      }
      if (clRes.data) setItems(clRes.data as LocalItem[])
      setLoading(false)
    }
    load()
  }, [])

  // ── 날짜 변경 시: 해당 날짜의 체크 기록 로드 ───────────

  useEffect(() => {
    async function loadLogs() {
      const { data } = await supabase
        .from('checklist_logs')
        .select('checklist_id, checked_at, staffs(name)')
        .eq('log_date', selectedDate)
        .eq('is_completed', true)

      if (data) {
        const map = new Map<string, CompletionInfo>();
        
        // 1. unknown을 사용하여 타입스크립트 에러를 우회하고 우리가 원하는 타입으로 정의합니다.
        type LogRow = {
          checklist_id: string;
          checked_at: string;
          staffs: { name: string } | { name: string }[] | null;
        };

        for (const row of data as unknown as LogRow[]) {
          const t = new Date(row.checked_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          
          // 2. staffs가 배열인지 단일 객체인지 확인하여 이름을 안전하게 추출합니다.
          let staffName = '';
          if (Array.isArray(row.staffs)) {
            // 배열인 경우 첫 번째 항목의 이름을 가져옵니다.
            staffName = row.staffs[0]?.name ?? '';
          } else if (row.staffs) {
            // 단일 객체인 경우 바로 이름을 가져옵니다.
            staffName = row.staffs.name ?? '';
          }

          map.set(row.checklist_id, { staffName, time: t });
        }
        setLogs(map)
      }
    }
    loadLogs()
  }, [selectedDate])

  // ── 달력 달 변경 시: 해당 월의 기록 있는 날짜 로드 ─────

  useEffect(() => {
    async function loadDates() {
      const monthStart = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`
      const monthEnd   = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-31`
      const { data } = await supabase
        .from('checklist_logs')
        .select('log_date')
        .gte('log_date', monthStart)
        .lte('log_date', monthEnd)
      if (data) setLogDates(new Set((data as Array<{ log_date: string }>).map(r => r.log_date)))
    }
    if (showCal) loadDates()
  }, [showCal, calYear, calMonth])

  // ── 파생 값 ─────────────────────────────────────────────

  const isToday = selectedDate === today
  const isPast  = selectedDate < today

  const activeStaff   = staffList.filter(s => s.is_active)
  const selectedStaff = staffList.find(s => s.id === selectedStaffId)

  const tabItems = useMemo(() =>
    items.filter(i =>
      i.tab === activeTab &&
      i.is_active &&
      (i.start_date == null || i.start_date <= selectedDate)
    ).sort((a, b) => a.order - b.order),
    [items, activeTab, selectedDate]
  )
  const totalPages = Math.max(1, Math.ceil(tabItems.length / PAGE_SIZE))
  const pageItems  = tabItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const tabCompleted = tabItems.filter(i => logs.has(i.id)).length
  const progressPct  = tabItems.length > 0 ? Math.round((tabCompleted / tabItems.length) * 100) : 0

  // ── 달력 ────────────────────────────────────────────────

  function hasRecord(dateStr: string) {
    return logDates.has(dateStr) || (dateStr === selectedDate && logs.size > 0)
  }

  function openCalendar() {
    const d = new Date(`${selectedDate}T12:00:00`)
    setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); setShowCal(true)
  }

  function prevCalMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }

  function nextCalMonth() {
    const nowY = new Date().getFullYear(), nowM = new Date().getMonth()
    if (calYear > nowY || (calYear === nowY && calMonth >= nowM)) return
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  function selectCalDate(dateStr: string) {
    setSelectedDate(dateStr); setPage(1); setShowCal(false)
  }

  // ── 페이지 / 날짜 이동 ──────────────────────────────────

  function goToPage(n: number) { if (n >= 1 && n <= totalPages) setPage(n) }

  function changeDate(days: number) {
    const next = shiftDate(selectedDate, days)
    if (next > today) return
    setSelectedDate(next); setPage(1)
  }

  function switchTab(t: ChecklistTab) { setActiveTab(t); setPage(1) }

  // ── 스와이프 ─────────────────────────────────────────────

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = touchStartX.current - e.changedTouches[0].clientX
    const dy = touchStartY.current - e.changedTouches[0].clientY
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) goToPage(page + 1)
      else        goToPage(page - 1)
    }
    touchStartX.current = null; touchStartY.current = null
  }

  // ── 체크 ─────────────────────────────────────────────────

  async function handleCheck(id: string, checked: boolean) {
    if (!isToday || !selectedStaffId || saving) return
    setSaving(id)

    if (checked) {
      const { data } = await supabase
        .from('checklist_logs')
        .insert({ checklist_id: id, staff_id: selectedStaffId, log_date: today, is_completed: true })
        .select('checked_at, staffs(name)')
        .single()

      if (data) {
        const t = new Date((data as { checked_at: string }).checked_at)
          .toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
        setLogs(prev => new Map(prev).set(id, { staffName: selectedStaff?.name ?? '', time: t }))
      }
    } else {
      await supabase.from('checklist_logs').delete()
        .eq('checklist_id', id).eq('log_date', today)
      setLogs(prev => { const m = new Map(prev); m.delete(id); return m })
    }
    setSaving(null)
  }

  // ── 항목 편집 ────────────────────────────────────────────

  function moveItem(id: string, dir: -1 | 1) {
    setItems(prev => {
      const sorted = prev.filter(i => i.tab === activeTab).sort((a, b) => a.order - b.order)
      const idx    = sorted.findIndex(i => i.id === id)
      const swap   = idx + dir
      if (swap < 0 || swap >= sorted.length) return prev
      const result = [...prev]
      const iA = result.findIndex(i => i.id === sorted[idx].id)
      const iB = result.findIndex(i => i.id === sorted[swap].id)
      const tmp = result[iA].order
      result[iA] = { ...result[iA], order: result[iB].order }
      result[iB] = { ...result[iB], order: tmp }
      // Supabase 업데이트 (fire-and-forget)
      supabase.from('checklists').update({ order: result[iA].order }).eq('id', result[iA].id)
      supabase.from('checklists').update({ order: result[iB].order }).eq('id', result[iB].id)
      return result
    })
  }

  async function deleteItem(id: string) {
    await supabase.from('checklists').update({ is_active: false }).eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    setDeletingId(null)
  }

  async function saveItem(item: LocalItem) {
    if (item.id.startsWith('new-')) {
      // INSERT
      const { data } = await supabase
        .from('checklists')
        .insert({ tab: item.tab, order: item.order, title: item.title, description: item.description, is_active: true, start_date: today })
        .select()
        .single()
      if (data) setItems(prev => [...prev, data as LocalItem])
    } else {
      // UPDATE
      await supabase.from('checklists').update({
        tab: item.tab, order: item.order, title: item.title, description: item.description,
      }).eq('id', item.id)
      setItems(prev => prev.map(i => i.id === item.id ? { ...item } : i))
    }
    setEditingItem(null)
  }

  // ── 직원 편집 ────────────────────────────────────────────

  async function saveStaff(staff: LocalStaff) {
    if (staff.id.startsWith('new-')) {
      const { data } = await supabase
        .from('staffs')
        .insert({ name: staff.name, hourly_wage: staff.hourly_wage, is_active: true, color_index: staff.color_index })
        .select()
        .single()
      if (data) setStaffList(prev => [...prev, data as LocalStaff])
    } else {
      await supabase.from('staffs').update({ name: staff.name, hourly_wage: staff.hourly_wage, color_index: staff.color_index }).eq('id', staff.id)
      setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, ...staff } : s))
    }
    setEditingStaff(null)
  }

  async function toggleStaffActive(id: string) {
    const s = staffList.find(s => s.id === id)
    if (!s) return
    await supabase.from('staffs').update({ is_active: !s.is_active }).eq('id', id)
    setStaffList(prev => prev.map(s => s.id === id ? { ...s, is_active: !s.is_active } : s))
  }

  // ── 날짜 라벨 ────────────────────────────────────────────

  const selD         = new Date(`${selectedDate}T12:00:00`)
  const dateMain     = selD.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const dateBadge    = selectedDate === today ? '오늘' : selectedDate === shiftDate(today, -1) ? '어제' : null
  const calGrid      = buildCalendarGrid(calYear, calMonth)
  const nowY         = new Date().getFullYear()
  const nowM         = new Date().getMonth()
  const isLastCalMon = calYear > nowY || (calYear === nowY && calMonth >= nowM)

  // ── 로딩 ─────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
          <p className="text-sm text-stone-400">데이터 불러오는 중...</p>
        </div>
      </main>
    )
  }

  if (dbError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAF8F5] p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 max-w-lg w-full">
          <p className="font-bold text-red-700 mb-2">Supabase 에러</p>
          <p className="text-sm font-mono text-red-600 break-all">{dbError}</p>
        </div>
      </main>
    )
  }

  // ── 렌더 ─────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#FAF8F5] px-6 py-8 select-none">
      <div className="mx-auto max-w-2xl">

        {/* 헤더 */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-stone-800">매장 체크리스트</h1>
          <div className="flex flex-shrink-0 flex-col items-end gap-2">
            {isToday ? (
              <div className="flex items-end gap-2">
                {isAdmin && (
                  <button onClick={() => setShowStaffMgr(true)} className="mb-0.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs font-semibold text-stone-500 hover:bg-stone-50 active:scale-95">
                    직원 관리
                  </button>
                )}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">담당 직원</label>
                  <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                    {activeStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <span className="self-center rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-500">기록 조회 · 수정 불가</span>
            )}
          </div>
        </div>

        {/* 날짜 네비게이터 + 달력 팝업 */}
        <div className="relative mb-4">
          <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-2 py-3 shadow-sm">
            <button onClick={() => changeDate(-1)} className="rounded-xl p-2.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 active:scale-90"><ChevronLeft /></button>
            <button onClick={openCalendar} className="flex flex-col items-center rounded-xl px-4 py-1 hover:bg-stone-50 active:bg-stone-100">
              <span className="text-sm font-bold text-stone-700">{dateMain}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-400">
                {dateBadge && <span className={`rounded-full px-2 py-0.5 font-bold ${isToday ? 'bg-amber-100 text-amber-600' : 'bg-stone-100 text-stone-500'}`}>{dateBadge}</span>}
                <span className={dateBadge ? 'text-stone-300' : ''}>달력 열기 ↓</span>
              </span>
            </button>
            <button onClick={() => changeDate(+1)} disabled={isToday} className="rounded-xl p-2.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 active:scale-90 disabled:pointer-events-none disabled:opacity-20"><ChevronRight /></button>
          </div>

          {showCal && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowCal(false)} />
              <div className="absolute left-0 right-0 z-20 mt-2 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <button onClick={prevCalMonth} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100 active:scale-90">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  </button>
                  <span className="text-sm font-bold text-stone-700">{calYear}년 {calMonth + 1}월</span>
                  <button onClick={nextCalMonth} disabled={isLastCalMon} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100 active:scale-90 disabled:pointer-events-none disabled:opacity-20">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </button>
                </div>
                <div className="mb-1 grid grid-cols-7">
                  {WEEKDAYS.map((wd, i) => <div key={wd} className={`py-1 text-center text-[11px] font-semibold ${i === 5 ? 'text-blue-400' : i === 6 ? 'text-red-400' : 'text-stone-400'}`}>{wd}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                  {calGrid.map((dateStr, idx) => {
                    if (!dateStr) return <div key={`e-${idx}`} />
                    const isFuture = dateStr > today
                    const isSel    = dateStr === selectedDate
                    const isT      = dateStr === today
                    const rec      = hasRecord(dateStr)
                    const col      = idx % 7
                    return (
                      <button key={dateStr} disabled={isFuture} onClick={() => selectCalDate(dateStr)}
                        className={`relative flex flex-col items-center rounded-xl py-2 transition-all active:scale-95 ${isSel ? 'bg-amber-500 text-white shadow-sm' : isT ? 'bg-amber-50 font-bold text-amber-600' : isFuture ? 'text-stone-300' : col === 5 ? 'text-blue-500 hover:bg-blue-50' : col === 6 ? 'text-red-500 hover:bg-red-50' : 'text-stone-600 hover:bg-stone-100'}`}
                      >
                        <span className="text-sm leading-none">{new Date(`${dateStr}T12:00:00`).getDate()}</span>
                        {rec ? <span className={`mt-1 h-1.5 w-1.5 rounded-full ${isSel ? 'bg-white/70' : 'bg-amber-400'}`} /> : <span className="mt-1 h-1.5 w-1.5" />}
                      </button>
                    )
                  })}
                </div>
                {selectedDate !== today && (
                  <button onClick={() => selectCalDate(today)} className="mt-4 w-full rounded-xl border border-amber-200 bg-amber-50 py-2 text-sm font-semibold text-amber-600 hover:bg-amber-100 active:scale-[0.99]">오늘로 이동</button>
                )}
              </div>
            </>
          )}
        </div>

        {!isToday && !showCal && (
          <button onClick={() => { setSelectedDate(today); setPage(1) }} className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-sm font-semibold text-amber-600 hover:bg-amber-100 active:scale-[0.99]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            오늘로 돌아가기
          </button>
        )}

        {/* 탭 + 편집 모드 */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex rounded-xl bg-stone-100 p-1">
            {(['오픈', '마감'] as ChecklistTab[]).map(t => (
              <button key={t} onClick={() => switchTab(t)} className={`rounded-lg px-6 py-2 text-sm font-bold transition-all duration-200 ${activeTab === t ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>{t}</button>
            ))}
          </div>
          <button onClick={() => { setEditMode(e => !e); setDeletingId(null) }} className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${editMode ? 'bg-amber-500 text-white shadow-sm' : 'border border-stone-200 bg-white text-stone-500 hover:bg-stone-50'}`}>
            {editMode ? '편집 완료' : '편집 모드'}
          </button>
        </div>

        {/* 진행률 바 */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-stone-500">{activeTab} {isToday ? '진행률' : '완료 현황'}</span>
            <span className="font-bold text-amber-600">{tabCompleted} / {tabItems.length} 완료</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* 체크리스트 */}
        <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="touch-pan-y space-y-3">
          {pageItems.map((item, localIdx) => {
            const globalIdx  = (page - 1) * PAGE_SIZE + localIdx
            const info       = logs.get(item.id)
            const done       = !!info
            const isBusy     = saving === item.id
            const isDeleting = deletingId === item.id
            const isFirst    = globalIdx === 0
            const isLast     = globalIdx === tabItems.length - 1

            if (editMode) {
              return (
                <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
                  <div className="flex flex-col gap-1">
                    <button onClick={() => moveItem(item.id, -1)} disabled={isFirst} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 disabled:opacity-20 active:scale-90">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                    </button>
                    <button onClick={() => moveItem(item.id, 1)} disabled={isLast} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 disabled:opacity-20 active:scale-90">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </button>
                  </div>
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 flex items-center justify-center">
                    {item.imageDataUrl ? <img src={item.imageDataUrl} className="h-full w-full object-cover" alt="" /> : <CameraIcon />}
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="break-words whitespace-normal text-sm font-semibold text-stone-700">{item.title}</p>
                    {item.description && <p className="break-words whitespace-normal text-[11px] text-stone-400">{item.description}</p>}
                  </div>
                  {isDeleting ? (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className="text-xs font-semibold text-stone-500">삭제할까요?</span>
                      <button onClick={() => setDeletingId(null)} className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-500 hover:bg-stone-50">취소</button>
                      <button onClick={() => deleteItem(item.id)} className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-600">삭제</button>
                    </div>
                  ) : (
                    <div className="flex flex-shrink-0 gap-2">
                      <button onClick={() => setEditingItem(item)} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 active:scale-95">수정</button>
                      <button onClick={() => setDeletingId(item.id)} className="rounded-xl border border-red-100 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-50 active:scale-95">삭제</button>
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div key={item.id} className={`flex items-center gap-4 rounded-2xl border p-4 transition-all duration-200 ${done ? 'border-amber-200 bg-amber-50/60' : isPast ? 'border-stone-100 bg-white/70' : 'border-stone-200 bg-white shadow-sm active:scale-[0.99]'}`}>
                <div className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border-2 border-dashed flex items-center justify-center ${done ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-stone-100/60'}`}>
                  {item.imageDataUrl ? <img src={item.imageDataUrl} className="h-full w-full object-cover" alt="" /> : <CameraIcon />}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className={`break-words whitespace-normal text-[15px] font-semibold leading-snug ${done ? 'text-stone-400 line-through decoration-amber-400' : isPast ? 'text-stone-400' : 'text-stone-800'}`}>{item.title}</p>
                  {item.description && <p className="mt-0.5 break-words whitespace-normal text-xs text-stone-400">{item.description}</p>}
                </div>
                <div className="flex min-w-[90px] flex-shrink-0 flex-col items-end justify-center">
                  {isBusy ? (
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
                  ) : done ? (
                    <button onClick={() => isToday ? handleCheck(item.id, false) : undefined} className={`text-right ${isToday ? 'active:opacity-60' : 'cursor-default'}`}>
                      <span className="block text-xs font-bold text-amber-600">완료 · {info.staffName}</span>
                      <span className="mt-0.5 block text-[11px] text-stone-400">{info.time}</span>
                    </button>
                  ) : isPast ? (
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-400">미완료</span>
                  ) : (
                    <button disabled={!selectedStaffId} onClick={() => handleCheck(item.id, true)} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-stone-300 bg-white transition-all hover:border-amber-400 hover:bg-amber-50 active:scale-90 disabled:opacity-40">
                      <CheckIcon />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {editMode && (
          <button onClick={() => setEditingItem('new')} className="mt-3 w-full rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/50 py-4 text-sm font-semibold text-amber-600 hover:bg-amber-50 active:scale-[0.99]">
            + 항목 추가
          </button>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => goToPage(page - 1)} disabled={page === 1} className="rounded-full p-1.5 text-stone-400 hover:text-stone-600 disabled:opacity-20">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              </button>
              <div className="flex gap-2">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i} onClick={() => goToPage(i + 1)} className={`rounded-full transition-all duration-300 ${i + 1 === page ? 'h-2.5 w-8 bg-amber-500' : 'h-2.5 w-2.5 bg-stone-300 hover:bg-stone-400'}`} />
                ))}
              </div>
              <button onClick={() => goToPage(page + 1)} disabled={page === totalPages} className="rounded-full p-1.5 text-stone-400 hover:text-stone-600 disabled:opacity-20">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
            <p className="text-[11px] tracking-wide text-stone-400">좌우로 밀어 페이지 이동</p>
          </div>
        )}
      </div>

      {editingItem !== null && (
        <ItemEditModal item={editingItem === 'new' ? null : editingItem} defaultTab={activeTab} onSave={saveItem} onClose={() => setEditingItem(null)} />
      )}

      {showStaffMgr && (
        <StaffModal
          staffList={staffList}
          editingStaff={editingStaff}
          setEditingStaff={s => setEditingStaff(s as LocalStaff | 'new' | null)}
          onSave={saveStaff}
          onToggleActive={toggleStaffActive}
          onClose={() => { setShowStaffMgr(false); setEditingStaff(null) }}
        />
      )}
    </main>
  )
}

// ── 항목 편집 모달 ────────────────────────────────────────

function ItemEditModal({ item, defaultTab, onSave, onClose }: {
  item: LocalItem | null
  defaultTab: ChecklistTab
  onSave: (item: LocalItem) => void
  onClose: () => void
}) {
  const [tab,         setTab]         = useState<ChecklistTab>(item?.tab ?? defaultTab)
  const [title,       setTitle]       = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [imgUrl,      setImgUrl]      = useState<string | undefined>(item?.imageDataUrl)

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setImgUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleSave() {
    if (!title.trim()) return
    onSave({ id: item?.id ?? `new-${Date.now()}`, tab, order: item?.order ?? 999, title: title.trim(), description: description.trim() || null, is_active: true, start_date: item?.start_date ?? null, imageDataUrl: imgUrl })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-stone-800">{item ? '항목 수정' : '항목 추가'}</h2>
          <button onClick={onClose} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">분류</label>
          <div className="flex rounded-xl bg-stone-100 p-1">
            {(['오픈', '마감'] as ChecklistTab[]).map(t => <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${tab === t ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>{t}</button>)}
          </div>
        </div>
        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">사진</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50 p-3 hover:border-amber-300 hover:bg-amber-50/30 active:scale-[0.99]">
            {imgUrl ? <img src={imgUrl} className="h-20 w-20 flex-shrink-0 rounded-xl object-cover" alt="" /> : <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-stone-200"><svg className="h-6 w-6 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg></div>}
            <div><p className="text-sm font-semibold text-stone-600">{imgUrl ? '사진 변경' : '사진 추가'}</p><p className="text-xs text-stone-400">탭하여 갤러리에서 선택</p></div>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
          {imgUrl && <button onClick={() => setImgUrl(undefined)} className="mt-2 text-xs font-semibold text-red-400 hover:text-red-600">사진 제거</button>}
        </div>
        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">항목 이름 *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예) 에스프레소 머신 예열" className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
        </div>
        <div className="mb-6">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">설명 (선택)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="예) 오픈 30분 전 전원 켜기" rows={2} className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-stone-200 py-3 text-sm font-semibold text-stone-500 hover:bg-stone-50">취소</button>
          <button onClick={handleSave} disabled={!title.trim()} className="flex-1 rounded-xl bg-amber-400 py-3 text-sm font-extrabold text-white hover:bg-amber-500 disabled:opacity-40">{item ? '저장' : '추가'}</button>
        </div>
      </div>
    </div>
  )
}

