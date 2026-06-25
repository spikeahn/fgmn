'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/contexts/AdminContext'
import type { ChecklistTab } from '@/types/database'
import { StaffModal } from '@/components/StaffModal'
import type { StaffItem } from '@/components/StaffModal'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

// ── 로컬 타입 ─────────────────────────────────────────────

interface CompletionInfo { staffName: string; time: string }

interface LocalItem {
  id: string
  tab: ChecklistTab
  section: string | null
  order: number
  title: string
  description: string | null
  is_active: boolean
  start_date: string | null
  image_url?: string | null
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

  // ── 편집 모드 비밀번호 ───────────────────────────────────
  const [showEditPw,  setShowEditPw]  = useState(false)
  const [editPw,      setEditPw]      = useState('')
  const [editPwShake, setEditPwShake] = useState(false)

  // ── 섹션 refs (스크롤 이동용) ────────────────────────────
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

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

  // ── 날짜 변경 시: 로그 로드 ─────────────────────────────
  useEffect(() => {
    async function loadLogs() {
      const { data } = await supabase
        .from('checklist_logs')
        .select('checklist_id, checked_at, staffs(name)')
        .eq('log_date', selectedDate)
        .eq('is_completed', true)

      if (data) {
        const map = new Map<string, CompletionInfo>()
        type LogRow = {
          checklist_id: string
          checked_at: string
          staffs: { name: string } | { name: string }[] | null
        }
        for (const row of data as unknown as LogRow[]) {
          const t = new Date(row.checked_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          let staffName = ''
          if (Array.isArray(row.staffs)) staffName = row.staffs[0]?.name ?? ''
          else if (row.staffs) staffName = row.staffs.name ?? ''
          map.set(row.checklist_id, { staffName, time: t })
        }
        setLogs(map)
      }
    }
    loadLogs()
  }, [selectedDate])

  // ── 달력 달 변경 시: 기록 있는 날짜 로드 ───────────────
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

  // 섹션별 그룹핑 (order 순으로 연속된 같은 섹션끼리 묶음)
  const sectionGroups = useMemo(() => {
    const groups: { section: string | null; items: LocalItem[] }[] = []
    for (const item of tabItems) {
      const last = groups[groups.length - 1]
      if (last && last.section === item.section) {
        last.items.push(item)
      } else {
        groups.push({ section: item.section, items: [item] })
      }
    }
    return groups
  }, [tabItems])

  // 섹션 완료 현황 (네비게이션 버튼용)
  const sectionStats = useMemo(() =>
    sectionGroups
      .filter(g => g.section !== null)
      .map(g => ({
        name: g.section!,
        total: g.items.length,
        done: g.items.filter(i => logs.has(i.id)).length,
      })),
    [sectionGroups, logs]
  )

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
    setSelectedDate(dateStr); setShowCal(false)
  }

  // ── 날짜 이동 ────────────────────────────────────────────
  function changeDate(days: number) {
    const next = shiftDate(selectedDate, days)
    if (next > today) return
    setSelectedDate(next)
  }

  function switchTab(t: ChecklistTab) { setActiveTab(t) }

  // ── 섹션 스크롤 ─────────────────────────────────────────
  function scrollToSection(name: string) {
    sectionRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      const { data, error } = await supabase
        .from('checklists')
        .insert({ tab: item.tab, section: item.section, order: item.order, title: item.title, description: item.description, is_active: true, start_date: today, image_url: item.image_url ?? null })
        .select()
        .single()
      if (error) { alert(`추가 실패: ${error.message}`); return }
      if (data) setItems(prev => [...prev, data as LocalItem])
    } else {
      const { error } = await supabase.from('checklists').update({
        tab: item.tab, section: item.section, order: item.order, title: item.title, description: item.description, image_url: item.image_url ?? null,
      }).eq('id', item.id)
      if (error) { alert(`수정 실패: ${error.message}`); return }
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
    <main className="min-h-screen bg-[#FAF8F5] px-3 py-5 select-none sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl">

        {/* 헤더 */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-stone-800 sm:text-3xl">매장 체크리스트</h1>
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
          <button onClick={() => setSelectedDate(today)} className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-sm font-semibold text-amber-600 hover:bg-amber-100 active:scale-[0.99]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            오늘로 돌아가기
          </button>
        )}

        {/* 탭 + 편집 모드 */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex rounded-xl bg-stone-100 p-1">
            {(['오픈', '마감'] as ChecklistTab[]).map(t => (
              <button key={t} onClick={() => switchTab(t)} className={`rounded-lg px-6 py-2 text-sm font-bold transition-all duration-200 ${activeTab === t ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>{t}</button>
            ))}
          </div>
          <button
            onClick={() => {
              if (editMode) { setEditMode(false); setDeletingId(null) }
              else { setEditPw(''); setShowEditPw(true) }
            }}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${editMode ? 'bg-amber-500 text-white shadow-sm' : 'border border-stone-200 bg-white text-stone-500 hover:bg-stone-50'}`}
          >
            {editMode ? '편집 완료' : '편집 모드'}
          </button>
        </div>

        {/* 섹션 네비게이션 버튼 */}
        {sectionStats.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {sectionStats.map(s => {
              const allDone = s.total > 0 && s.done === s.total
              return (
                <button
                  key={s.name}
                  onClick={() => scrollToSection(s.name)}
                  className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                    allDone
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {allDone ? '✓ ' : ''}{s.name}
                </button>
              )
            })}
          </div>
        )}

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

        {/* 체크리스트 (섹션별) */}
        <div className="space-y-6">
          {(() => {
            let globalIdx = 0
            return sectionGroups.map(({ section, items: groupItems }) => (
              <div key={section ?? '__nosection__'}>
                {section && (
                  <div
                    ref={el => { sectionRefs.current[section] = el }}
                    className="mb-3 flex items-center gap-3 scroll-mt-4"
                  >
                    <span className="text-[11px] font-extrabold uppercase tracking-widest text-stone-400">{section}</span>
                    <div className="h-px flex-1 bg-stone-200" />
                  </div>
                )}
                <div className="space-y-2">
                  {groupItems.map(item => {
                    const gIdx       = globalIdx++
                    const info       = logs.get(item.id)
                    const done       = !!info
                    const isBusy     = saving === item.id
                    const isDeleting = deletingId === item.id
                    const isFirst    = gIdx === 0
                    const isLast     = gIdx === tabItems.length - 1

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
                            {item.image_url ? <img src={item.image_url} className="h-full w-full object-cover" alt="" /> : <CameraIcon />}
                          </div>
                          <div className="min-w-0 flex-1 overflow-hidden">
                            {item.section && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500">{item.section}</p>}
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
              </div>
            ))
          })()}
        </div>

        {editMode && (
          <button onClick={() => setEditingItem('new')} className="mt-4 w-full rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/50 py-4 text-sm font-semibold text-amber-600 hover:bg-amber-50 active:scale-[0.99]">
            + 항목 추가
          </button>
        )}

        <div className="h-8" />
      </div>

      {editingItem !== null && (
        <ItemEditModal
          item={editingItem === 'new' ? null : editingItem}
          defaultTab={activeTab}
          defaultSection={
            editingItem === 'new'
              ? (sectionGroups[sectionGroups.length - 1]?.section ?? '')
              : (editingItem.section ?? '')
          }
          onSave={saveItem}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* 편집 모드 비밀번호 모달 */}
      {showEditPw && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setShowEditPw(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className={`w-72 rounded-2xl bg-white p-6 shadow-2xl ${editPwShake ? 'animate-shake' : ''}`}
              onClick={e => e.stopPropagation()}
            >
              <p className="mb-1 text-center text-base font-extrabold text-stone-800">편집 모드</p>
              <p className="mb-5 text-center text-xs text-stone-400">비밀번호를 입력하세요</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={editPw}
                autoFocus
                onChange={e => setEditPw(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (editPw === '1234') { setEditMode(true); setShowEditPw(false); setEditPw('') }
                    else { setEditPwShake(true); setEditPw(''); setTimeout(() => setEditPwShake(false), 500) }
                  }
                }}
                placeholder="• • • •"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
              <div className="mt-4 flex gap-2">
                <button onClick={() => { setShowEditPw(false); setEditPw('') }} className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-500 hover:bg-stone-50">취소</button>
                <button
                  onClick={() => {
                    if (editPw === '1234') { setEditMode(true); setShowEditPw(false); setEditPw('') }
                    else { setEditPwShake(true); setEditPw(''); setTimeout(() => setEditPwShake(false), 500) }
                  }}
                  className="flex-1 rounded-xl bg-amber-400 py-2.5 text-sm font-extrabold text-white hover:bg-amber-500"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </>
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

function ItemEditModal({ item, defaultTab, defaultSection, onSave, onClose }: {
  item: LocalItem | null
  defaultTab: ChecklistTab
  defaultSection: string
  onSave: (item: LocalItem) => void
  onClose: () => void
}) {
  const [tab,         setTab]         = useState<ChecklistTab>(item?.tab ?? defaultTab)
  const [section,     setSection]     = useState(item?.section ?? defaultSection)
  const [title,       setTitle]       = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [imgPreview,  setImgPreview]  = useState<string | undefined>(item?.image_url ?? undefined)
  const [imgFile,     setImgFile]     = useState<File | null>(null)
  const [imgRemoved,  setImgRemoved]  = useState(false)
  const [uploading,   setUploading]   = useState(false)

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgFile(file)
    setImgRemoved(false)
    const reader = new FileReader()
    reader.onload = ev => setImgPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!title.trim() || uploading) return
    setUploading(true)

    let image_url: string | null = imgRemoved ? null : (item?.image_url ?? null)

    if (imgFile) {
      const fileName = `${item?.id && !item.id.startsWith('new-') ? item.id : Date.now()}-${Date.now()}.${imgFile.name.split('.').pop() ?? 'jpg'}`
      const { error: uploadError } = await supabase.storage
        .from('checklist-images')
        .upload(fileName, imgFile, { upsert: true })
      if (uploadError) {
        alert(`이미지 업로드 실패: ${uploadError.message}\nSupabase Storage에 'checklist-images' 버킷이 있는지 확인하세요.`)
      } else {
        const { data: urlData } = supabase.storage.from('checklist-images').getPublicUrl(fileName)
        image_url = urlData.publicUrl
      }
    }

    setUploading(false)
    onSave({
      id: item?.id ?? `new-${Date.now()}`,
      tab,
      section: section.trim() || null,
      order: item?.order ?? 999,
      title: title.trim(),
      description: description.trim() || null,
      is_active: true,
      start_date: item?.start_date ?? null,
      image_url,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-stone-800">{item ? '항목 수정' : '항목 추가'}</h2>
          <button onClick={onClose} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">분류</label>
          <div className="flex rounded-xl bg-stone-100 p-1">
            {(['오픈', '마감'] as ChecklistTab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${tab === t ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>{t}</button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">섹션</label>
          <input
            value={section}
            onChange={e => setSection(e.target.value)}
            placeholder="예) 에스프레소 세팅"
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">사진</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50 p-3 hover:border-amber-300 hover:bg-amber-50/30 active:scale-[0.99]">
            {imgPreview
              ? <img src={imgPreview} className="h-20 w-20 flex-shrink-0 rounded-xl object-cover" alt="" />
              : <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-stone-200">
                  <svg className="h-6 w-6 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
                </div>
            }
            <div>
              <p className="text-sm font-semibold text-stone-600">{imgPreview ? '사진 변경' : '사진 추가'}</p>
              <p className="text-xs text-stone-400">탭하여 갤러리에서 선택</p>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
          {imgPreview && (
            <button onClick={() => { setImgPreview(undefined); setImgFile(null); setImgRemoved(true) }} className="mt-2 text-xs font-semibold text-red-400 hover:text-red-600">
              사진 제거
            </button>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">항목 이름 *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="예) 에스프레소 머신 예열"
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">설명 (선택)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="예) 오픈 30분 전 전원 켜기"
            rows={2}
            className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-stone-200 py-3 text-sm font-semibold text-stone-500 hover:bg-stone-50">취소</button>
          <button onClick={handleSave} disabled={!title.trim() || uploading} className="flex-1 rounded-xl bg-amber-400 py-3 text-sm font-extrabold text-white hover:bg-amber-500 disabled:opacity-40">
            {uploading ? '저장 중...' : (item ? '저장' : '추가')}
          </button>
        </div>
      </div>
    </div>
  )
}
