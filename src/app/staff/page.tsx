'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/contexts/AdminContext'
import { COLOR_PALETTE } from '@/components/StaffModal'

// ── 타입 ────────────────────────────────────────────────────

interface StaffDetail {
  id:                   string
  name:                 string
  hourly_wage:          number
  is_active:            boolean
  color_index:          number | null
  phone:                string | null
  foreign_reg_number:   string | null
  bank_account:         string | null
  health_certificate:   boolean
  hire_date:            string | null
  resignation_date:     string | null
  visa_expiry_date:     string | null
  visa_info:            string | null
  memo:                 string | null
}

const EMPTY: Omit<StaffDetail, 'id'> = {
  name: '', hourly_wage: 0, is_active: true, color_index: null,
  phone: null, foreign_reg_number: null, bank_account: null,
  health_certificate: false, hire_date: null, resignation_date: null,
  visa_expiry_date: null, visa_info: null, memo: null,
}

// ── 헬퍼 ────────────────────────────────────────────────────

function visaExpiryStatus(dateStr: string | null): 'expired' | 'soon' | 'ok' | null {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const expiry = new Date(dateStr)
  if (expiry < today) return 'expired'
  const twoMonths = new Date(today); twoMonths.setMonth(today.getMonth() + 2)
  if (expiry <= twoMonths) return 'soon'
  return 'ok'
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
const textareaCls = "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none"

// ── 메인 ────────────────────────────────────────────────────

export default function StaffPage() {
  const { isAdmin } = useAdmin()
  const [staffList,     setStaffList]     = useState<StaffDetail[]>([])
  const [loading,       setLoading]       = useState(true)
  const [editing,       setEditing]       = useState<StaffDetail | 'new' | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showInactive,  setShowInactive]  = useState(false)

  const [form, setForm] = useState<Omit<StaffDetail, 'id'>>(EMPTY)

  useEffect(() => { setConfirmDelete(false) }, [editing])

  useEffect(() => {
    if (!isAdmin) return
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('staffs').select('*').order('name')
      if (data) setStaffList(data as StaffDetail[])
      setLoading(false)
    }
    load()
  }, [isAdmin])

  function openNew() {
    setForm({ ...EMPTY })
    setEditing('new')
  }

  function openEdit(s: StaffDetail) {
    setForm({
      name:               s.name,
      hourly_wage:        s.hourly_wage,
      is_active:          s.is_active,
      color_index:        s.color_index,
      phone:              s.phone ?? '',
      foreign_reg_number: s.foreign_reg_number ?? '',
      bank_account:       s.bank_account ?? '',
      health_certificate: s.health_certificate,
      hire_date:          s.hire_date ?? '',
      resignation_date:   s.resignation_date ?? '',
      visa_expiry_date:   s.visa_expiry_date ?? '',
      visa_info:          s.visa_info ?? '',
      memo:               s.memo ?? '',
    } as Omit<StaffDetail, 'id'>)
    setEditing(s)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    setSaveError(null)
    const payload = {
      name:               form.name.trim(),
      hourly_wage:        Number(form.hourly_wage) || 0,
      is_active:          form.is_active,
      color_index:        form.color_index,
      phone:              (form.phone as string)?.trim() || null,
      foreign_reg_number: (form.foreign_reg_number as string)?.trim() || null,
      bank_account:       (form.bank_account as string)?.trim() || null,
      health_certificate: form.health_certificate,
      hire_date:          (form.hire_date as string) || null,
      resignation_date:   (form.resignation_date as string) || null,
      visa_expiry_date:   (form.visa_expiry_date as string) || null,
      visa_info:          (form.visa_info as string)?.trim() || null,
      memo:               (form.memo as string)?.trim() || null,
    }

    if (editing === 'new') {
      const { data, error } = await supabase.from('staffs').insert(payload).select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) setStaffList(prev => [...prev, data as StaffDetail].sort((a, b) => a.name.localeCompare(b.name)))
    } else if (editing) {
      const { error } = await supabase.from('staffs').update(payload).eq('id', (editing as StaffDetail).id)
      if (error) { setSaveError(error.message); setSaving(false); return }
      setStaffList(prev => prev.map(s => s.id === (editing as StaffDetail).id ? { ...s, ...payload } : s))
    }
    setSaving(false)
    setEditing(null)
  }

  async function handleDelete() {
    if (!editing || editing === 'new') return
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase.from('staffs').delete().eq('id', (editing as StaffDetail).id)
    if (error) { setSaveError(error.message); setSaving(false); return }
    setStaffList(prev => prev.filter(s => s.id !== (editing as StaffDetail).id))
    setSaving(false)
    setEditing(null)
  }

  async function toggleActive(s: StaffDetail) {
    await supabase.from('staffs').update({ is_active: !s.is_active }).eq('id', s.id)
    setStaffList(prev => prev.map(p => p.id === s.id ? { ...p, is_active: !p.is_active } : p))
  }

  const inactiveCount = staffList.filter(s => !s.is_active).length
  const displayedStaff = showInactive ? staffList : staffList.filter(s => s.is_active)

  // ── 비관리자 ────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-[#FAF8F5]">
        <p className="text-sm font-semibold text-stone-400">관리자만 접근할 수 있습니다.</p>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-[#FAF8F5]">
        <span className="h-7 w-7 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5] px-4 py-8">
      <div className="mx-auto max-w-6xl">

        {/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-800">직원 관리</h1>
            <p className="mt-0.5 text-xs text-stone-400">
              활성 {staffList.filter(s => s.is_active).length}명
              {inactiveCount > 0 && ` · 비활성 ${inactiveCount}명`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {inactiveCount > 0 && (
              <button
                onClick={() => setShowInactive(v => !v)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  showInactive
                    ? 'border-stone-400 bg-stone-700 text-white'
                    : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50'
                }`}
              >
                {showInactive ? '비활성 숨기기' : `비활성 ${inactiveCount}명 보기`}
              </button>
            )}
            <button
              onClick={openNew}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-600 active:scale-95"
            >
              + 직원 추가
            </button>
          </div>
        </div>

        {/* 테이블 */}
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-stone-100 bg-stone-50">
                <tr>
                  {['이름', '연락처', '계좌번호', '보건증', '입사일', '퇴사일', '비자만료일', '활성화', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {displayedStaff.map((s, i) => {
                  const c = COLOR_PALETTE[(s.color_index ?? i) % COLOR_PALETTE.length]
                  const vs = visaExpiryStatus(s.visa_expiry_date)
                  return (
                    <tr key={s.id} className={`transition-colors hover:bg-stone-50/60 ${!s.is_active ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: c.dot }} />
                          <span className="font-semibold text-stone-800">{s.name}</span>
                          {!s.is_active && <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-400">비활성</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-500">{s.phone ?? <span className="text-stone-300">—</span>}</td>
                      <td className="px-4 py-3 font-mono text-xs text-stone-500">{s.bank_account ?? <span className="text-stone-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {s.health_certificate
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">✓ 제출</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-400">미제출</span>}
                      </td>
                      <td className="px-4 py-3 text-stone-500">{s.hire_date ?? <span className="text-stone-300">—</span>}</td>
                      <td className="px-4 py-3 text-stone-500">{s.resignation_date ?? <span className="text-stone-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {s.visa_expiry_date ? (
                          <span className={`text-xs font-medium ${
                            vs === 'expired' ? 'font-bold text-red-600' :
                            vs === 'soon'    ? 'text-red-500' :
                            'text-stone-500'
                          }`}>
                            {s.visa_expiry_date}
                            {vs === 'expired' && ' (만료)'}
                            {vs === 'soon'    && ' (임박)'}
                          </span>
                        ) : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActive(s)}
                          className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                            s.is_active
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                          }`}
                        >
                          {s.is_active ? 'ON' : 'OFF'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openEdit(s)}
                          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 active:scale-95"
                        >
                          수정
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {displayedStaff.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-stone-400">
                      {showInactive ? '등록된 직원이 없습니다.' : '활성 직원이 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 편집 모달 ───────────────────────────────────── */}
      {editing !== null && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between border-b border-stone-100 px-6 py-5">
                <h2 className="text-lg font-bold text-stone-800">
                  {editing === 'new' ? '직원 추가' : '직원 정보 수정'}
                </h2>
                <button onClick={() => setEditing(null)} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 폼 */}
              <div className="space-y-4 px-6 py-5">
                {/* 이름 + 시급 */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="이름 *">
                    <input className={inputCls} value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예) 카렌" />
                  </Field>
                  <Field label="시급 (원)">
                    <input className={inputCls} type="number" value={form.hourly_wage}
                      onChange={e => setForm(f => ({ ...f, hourly_wage: Number(e.target.value) }))} placeholder="10000" />
                  </Field>
                </div>

                {/* 연락처 */}
                <Field label="연락처">
                  <input className={inputCls} value={form.phone ?? ''}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
                </Field>

                {/* 외국인등록번호 */}
                <Field label="외국인등록번호">
                  <input className={inputCls + ' font-mono'} value={form.foreign_reg_number ?? ''}
                    onChange={e => setForm(f => ({ ...f, foreign_reg_number: e.target.value }))} placeholder="000000-0000000" />
                </Field>

                {/* 계좌번호 */}
                <Field label="계좌번호">
                  <input className={inputCls + ' font-mono'} value={form.bank_account ?? ''}
                    onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} placeholder="은행명 000-000-000000" />
                </Field>

                {/* 날짜 3개 */}
                <div className="grid grid-cols-3 gap-3">
                  <Field label="입사일">
                    <input className={inputCls} type="date" value={form.hire_date ?? ''}
                      onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))} />
                  </Field>
                  <Field label="퇴사일">
                    <input className={inputCls} type="date" value={form.resignation_date ?? ''}
                      onChange={e => setForm(f => ({ ...f, resignation_date: e.target.value }))} />
                  </Field>
                  <Field label="비자만료일">
                    <input className={inputCls} type="date" value={form.visa_expiry_date ?? ''}
                      onChange={e => setForm(f => ({ ...f, visa_expiry_date: e.target.value }))} />
                  </Field>
                </div>

                {/* 비자 정보 */}
                <Field label="비자 정보">
                  <textarea className={textareaCls} rows={3} value={form.visa_info ?? ''}
                    onChange={e => setForm(f => ({ ...f, visa_info: e.target.value }))}
                    placeholder="비자 종류, 체류자격, 기타 메모 등 자유롭게 입력" />
                </Field>

                {/* 컬러 */}
                <Field label="캘린더 컬러">
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PALETTE.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, color_index: i }))}
                        className="relative h-8 w-8 rounded-full transition-all active:scale-90"
                        style={{ background: c.dot }}
                      >
                        {(form.color_index ?? 0) === i && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <svg className="h-4 w-4 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </Field>

                {/* 보건증 + 활성화 */}
                <div className="flex gap-6">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input type="checkbox" checked={form.health_certificate}
                      onChange={e => setForm(f => ({ ...f, health_certificate: e.target.checked }))}
                      className="h-4 w-4 rounded border-stone-300 accent-amber-500" />
                    <span className="text-sm font-semibold text-stone-700">보건증 제출 완료</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input type="checkbox" checked={form.is_active}
                      onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                      className="h-4 w-4 rounded border-stone-300 accent-amber-500" />
                    <span className="text-sm font-semibold text-stone-700">활성화 (캘린더·직원목록 표시)</span>
                  </label>
                </div>

                {/* 메모 */}
                <Field label="메모">
                  <textarea className={textareaCls} rows={3} value={form.memo ?? ''}
                    onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                    placeholder="관리자 메모 (근무 특이사항, 연락 이력 등)" />
                </Field>
              </div>

              {/* 에러 */}
              {saveError && (
                <div className="mx-6 mb-2 rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-600">
                  오류: {saveError}
                </div>
              )}

              {/* 버튼 */}
              <div className="flex items-center gap-2 border-t border-stone-100 px-6 py-4">
                {editing !== 'new' && (
                  confirmDelete
                    ? <button onClick={handleDelete} disabled={saving}
                        className="shrink-0 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-40">
                        정말 삭제
                      </button>
                    : <button onClick={() => setConfirmDelete(true)}
                        className="shrink-0 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-50">
                        삭제
                      </button>
                )}
                <div className="flex flex-1 gap-2">
                  <button onClick={() => setEditing(null)}
                    className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50">
                    취소
                  </button>
                  <button onClick={handleSave} disabled={!form.name.trim() || saving}
                    className="flex-[2] rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-40">
                    {saving ? '저장 중...' : editing === 'new' ? '추가' : '저장'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
