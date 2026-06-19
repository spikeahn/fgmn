'use client'

import { useState } from 'react'

// ── 컬러 팔레트 (12색) ───────────────────────────────────

export const COLOR_PALETTE = [
  { bg: '#fef3c7', text: '#92400e', dot: '#d97706' },  // amber
  { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' },  // blue
  { bg: '#d1fae5', text: '#065f46', dot: '#10b981' },  // emerald
  { bg: '#ede9fe', text: '#5b21b6', dot: '#8b5cf6' },  // violet
  { bg: '#fce7f3', text: '#9d174d', dot: '#ec4899' },  // pink
  { bg: '#ffedd5', text: '#9a3412', dot: '#f97316' },  // orange
  { bg: '#e0f2fe', text: '#0c4a6e', dot: '#0ea5e9' },  // sky
  { bg: '#f0fdf4', text: '#14532d', dot: '#22c55e' },  // green
  { bg: '#fdf4ff', text: '#701a75', dot: '#d946ef' },  // fuchsia
  { bg: '#f1f5f9', text: '#1e293b', dot: '#64748b' },  // slate
  { bg: '#fef2f2', text: '#7f1d1d', dot: '#ef4444' },  // red
  { bg: '#fffbeb', text: '#78350f', dot: '#f59e0b' },  // yellow
]

// ── 타입 ─────────────────────────────────────────────────

export interface StaffItem {
  id:          string
  name:        string
  hourly_wage: number
  is_active:   boolean
  color_index: number | null
}

// ── 직원 관리 모달 ────────────────────────────────────────

export function StaffModal({
  staffList,
  editingStaff,
  setEditingStaff,
  onSave,
  onToggleActive,
  onClose,
}: {
  staffList:       StaffItem[]
  editingStaff:    StaffItem | 'new' | null
  setEditingStaff: (s: StaffItem | 'new' | null) => void
  onSave:          (s: StaffItem) => void
  onToggleActive:  (id: string) => void
  onClose:         () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-stone-800">직원 관리</h2>
          <button onClick={onClose} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {editingStaff !== null ? (
          <StaffEditForm
            staff={editingStaff === 'new' ? null : editingStaff}
            onSave={onSave}
            onCancel={() => setEditingStaff(null)}
          />
        ) : (
          <div className="space-y-2">
            {staffList.map((s, i) => {
              const c = COLOR_PALETTE[s.color_index ?? i % COLOR_PALETTE.length]
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 rounded-2xl border p-4 ${
                    s.is_active ? 'border-stone-200 bg-white' : 'border-stone-100 bg-stone-50'
                  }`}
                >
                  <div
                    className="h-4 w-4 flex-shrink-0 rounded-full ring-2 ring-white"
                    style={{ background: c.dot }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${s.is_active ? 'text-stone-800' : 'text-stone-400'}`}>
                      {s.name}
                    </p>
                    <p className="text-xs text-stone-400">₩{s.hourly_wage.toLocaleString()} / 시간</p>
                  </div>
                  <button
                    onClick={() => onToggleActive(s.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                      s.is_active
                        ? 'border border-stone-200 text-stone-500 hover:bg-stone-50'
                        : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                    }`}
                  >
                    {s.is_active ? '숨김' : '활성화'}
                  </button>
                  <button
                    onClick={() => setEditingStaff(s)}
                    className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                  >
                    수정
                  </button>
                </div>
              )
            })}
            <button
              onClick={() => setEditingStaff('new')}
              className="mt-2 w-full rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/50 py-4 text-sm font-semibold text-amber-600 hover:bg-amber-50 active:scale-[0.99]"
            >
              + 직원 추가
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 직원 편집 폼 (컬러 팔레트 포함) ──────────────────────

function StaffEditForm({
  staff,
  onSave,
  onCancel,
}: {
  staff:    StaffItem | null
  onSave:   (s: StaffItem) => void
  onCancel: () => void
}) {
  const [name,       setName]       = useState(staff?.name ?? '')
  const [wage,       setWage]       = useState(String(staff?.hourly_wage ?? ''))
  const [colorIndex, setColorIndex] = useState<number>(staff?.color_index ?? 0)

  function handleSave() {
    const wageNum = Number(wage.replace(/,/g, ''))
    if (!name.trim() || isNaN(wageNum) || wageNum <= 0) return
    onSave({
      id:          staff?.id ?? `new-${Date.now()}`,
      name:        name.trim(),
      hourly_wage: wageNum,
      is_active:   staff?.is_active ?? true,
      color_index: colorIndex,
    })
  }

  const previewColor = COLOR_PALETTE[colorIndex]

  return (
    <div>
      <h3 className="mb-4 text-sm font-bold text-stone-600">
        {staff ? '직원 정보 수정' : '새 직원 추가'}
      </h3>

      <div className="mb-4">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">이름 *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="예) 김지수"
          className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">시급 (원) *</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-stone-400">₩</span>
          <input
            type="number"
            min={0}
            value={wage}
            onChange={e => setWage(e.target.value)}
            placeholder="10000"
            className="w-full rounded-xl border border-stone-200 bg-stone-50 py-3 pl-8 pr-4 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">컬러</label>

        {/* 팔레트 그리드 */}
        <div className="grid grid-cols-6 gap-2.5">
          {COLOR_PALETTE.map((c, i) => (
            <button
              key={i}
              onClick={() => setColorIndex(i)}
              className="relative h-9 w-9 rounded-full transition-all active:scale-90"
              style={{ background: c.dot }}
            >
              {colorIndex === i && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <svg className="h-4 w-4 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 미리보기 */}
        <div className="mt-3 flex items-center gap-2">
          <div className="h-8 w-8 rounded-full" style={{ background: previewColor.dot }} />
          <span
            className="rounded-full px-3 py-1 text-sm font-semibold"
            style={{ background: previewColor.bg, color: previewColor.text }}
          >
            {name.trim() || '직원 이름'}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-stone-200 py-3 text-sm font-semibold text-stone-500 hover:bg-stone-50"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || !wage}
          className="flex-1 rounded-xl bg-amber-400 py-3 text-sm font-extrabold text-white hover:bg-amber-500 disabled:opacity-40"
        >
          {staff ? '저장' : '추가'}
        </button>
      </div>
    </div>
  )
}
