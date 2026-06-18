'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useAdmin } from '@/contexts/AdminContext'

const NAV_ITEMS = [
  { label: '체크리스트', href: '/checklist' },
  { label: '근무시간표',  href: '/schedule'  },
]

const SECRET_TAP = 5
const ADMIN_PW   = '1111'
const REPORT_PW  = '1111'

export default function TopNav() {
  const pathname    = usePathname()
  const router      = useRouter()
  const { isAdmin, enter: enterAdmin, exit: exitAdmin } = useAdmin()

  // 로고 탭 (관리자 모드)
  const logoTapCount = useRef(0)
  const logoTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 우측 탭 (급여 리포트)
  const reportTapCount = useRef(0)
  const reportTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 모달 상태
  const [modal,  setModal]  = useState<'admin' | 'report' | null>(null)
  const [pw,     setPw]     = useState('')
  const [shake,  setShake]  = useState(false)

  function handleLogoTap() {
    if (isAdmin) return  // 이미 관리자면 무시
    logoTapCount.current += 1
    if (logoTimer.current) clearTimeout(logoTimer.current)
    if (logoTapCount.current >= SECRET_TAP) {
      logoTapCount.current = 0
      setModal('admin')
      setPw('')
    } else {
      logoTimer.current = setTimeout(() => { logoTapCount.current = 0 }, 1500)
    }
  }

  function handleReportTap() {
    reportTapCount.current += 1
    if (reportTimer.current) clearTimeout(reportTimer.current)
    if (reportTapCount.current >= SECRET_TAP) {
      reportTapCount.current = 0
      setModal('report')
      setPw('')
    } else {
      reportTimer.current = setTimeout(() => { reportTapCount.current = 0 }, 1500)
    }
  }

  function handleSubmit() {
    const correct = modal === 'admin' ? ADMIN_PW : REPORT_PW
    if (pw === correct) {
      if (modal === 'admin') enterAdmin()
      else router.push('/report')
      setModal(null)
      setPw('')
    } else {
      setShake(true)
      setPw('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <>
      {/* ── 네비게이션 바 ──────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex h-14 items-center border-b border-stone-200 bg-white/90 px-4 backdrop-blur-sm">

        {/* 로고 — 5탭 → 관리자 모드 */}
        <button
          onPointerDown={handleLogoTap}
          className="mr-4 select-none text-base font-black tracking-tight text-stone-800 active:opacity-60"
        >
          FGMN
        </button>

        {/* 관리자 뱃지 */}
        {isAdmin && (
          <span className="mr-3 flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            관리자
          </span>
        )}

        {/* 페이지 탭 */}
        <div className="flex gap-1">
          {NAV_ITEMS.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors
                  ${active
                    ? 'bg-amber-100 text-amber-700'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
                  }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        {/* 관리자 종료 버튼 */}
        {isAdmin && (
          <button
            onClick={exitAdmin}
            className="ml-3 rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            종료
          </button>
        )}

        {/* 우측 비밀 탭 존 (급여 리포트) */}
        <div
          className="ml-auto h-10 w-16 cursor-default select-none"
          onPointerDown={handleReportTap}
          aria-hidden
        />
      </nav>

      {/* ── 비밀번호 모달 ─────────────────────────────── */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setModal(null); setPw('') }}
        >
          <div
            className={`w-72 rounded-2xl bg-white p-6 shadow-2xl ${shake ? 'animate-shake' : ''}`}
            onClick={e => e.stopPropagation()}
          >
            <p className="mb-1 text-center text-base font-extrabold text-stone-800">
              {modal === 'admin' ? '관리자 인증' : '급여 리포트'}
            </p>
            <p className="mb-5 text-center text-xs text-stone-400">
              {modal === 'admin' ? '관리자 비밀번호를 입력하세요' : '비밀번호를 입력하세요'}
            </p>

            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pw}
              autoFocus
              onChange={e => setPw(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="• • • •"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setModal(null); setPw('') }}
                className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-500 hover:bg-stone-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 rounded-xl bg-amber-400 py-2.5 text-sm font-extrabold text-white hover:bg-amber-500"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
