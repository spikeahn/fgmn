'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useAdmin } from '@/contexts/AdminContext'

const NAV_BASE = [
  { label: '체크리스트', href: '/checklist' },
  { label: '근무시간표',  href: '/schedule'  },
]
const NAV_ADMIN = [
  ...NAV_BASE,
  { label: '근무리포트', href: '/report'  },
  { label: '직원관리',   href: '/staff'   },
]

const SECRET_TAP = 5
const ADMIN_PW   = '1111'

export default function TopNav() {
  const pathname = usePathname()
  const router   = useRouter()
  const { isAdmin, enter: enterAdmin, exit: exitAdmin } = useAdmin()

  const tapCount = useRef(0)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [pw,        setPw]        = useState('')
  const [shake,     setShake]     = useState(false)
  const [menuOpen,  setMenuOpen]  = useState(false)

  function handleRightTap() {
    if (isAdmin) return
    tapCount.current += 1
    if (tapTimer.current) clearTimeout(tapTimer.current)
    if (tapCount.current >= SECRET_TAP) {
      tapCount.current = 0
      setShowModal(true)
      setPw('')
    } else {
      tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 1500)
    }
  }

  function handleSubmit() {
    if (pw === ADMIN_PW) {
      enterAdmin()
      setShowModal(false)
      setPw('')
    } else {
      setShake(true)
      setPw('')
      setTimeout(() => setShake(false), 500)
    }
  }

  function navigate(href: string) {
    router.push(href)
    setMenuOpen(false)
  }

  const navItems   = isAdmin ? NAV_ADMIN : NAV_BASE
  const activeItem = navItems.find(i => pathname.startsWith(i.href))

  return (
    <>
      {/* ── 네비게이션 바 ─────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-stone-200 bg-white/90 px-3 backdrop-blur-sm">

        {/* 로고 */}
        <span className="shrink-0 select-none text-sm font-black tracking-tight text-stone-800 sm:text-base">
          FGMN
        </span>

        {/* 데스크탑 탭 (sm+) */}
        <div className="hidden sm:flex flex-1 items-center gap-0.5">
          {isAdmin && (
            <span className="mr-1 shrink-0 flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              관리자
            </span>
          )}
          {navItems.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
                  active ? 'bg-amber-100 text-amber-700' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
                }`}
              >
                {item.label}
              </button>
            )
          })}
          {isAdmin && (
            <button
              onClick={exitAdmin}
              className="ml-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            >
              종료
            </button>
          )}
        </div>

        {/* 모바일 비관리자: 스크롤 탭 (2개여서 그냥 나열) */}
        {!isAdmin && (
          <div className="flex sm:hidden flex-1 min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]">
            {navItems.map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active ? 'bg-amber-100 text-amber-700' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        )}

        {/* 모바일 관리자: 현재 페이지명 + 뱃지 */}
        {isAdmin && (
          <div className="flex sm:hidden flex-1 min-w-0 items-center gap-1.5">
            <span className="shrink-0 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            </span>
            <span className="truncate text-sm font-semibold text-stone-700">
              {activeItem?.label ?? ''}
            </span>
          </div>
        )}

        {/* 모바일 관리자: 햄버거 버튼 */}
        {isAdmin && (
          <button
            className="sm:hidden shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 active:scale-90"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="메뉴"
          >
            {menuOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        )}

        {/* 우측 비밀 탭 */}
        <div
          className="shrink-0 h-10 w-10 cursor-default select-none"
          onPointerDown={handleRightTap}
          aria-hidden
        />
      </nav>

      {/* ── 모바일 드롭다운 메뉴 (관리자) ──────────────── */}
      {isAdmin && menuOpen && (
        <>
          <div
            className="sm:hidden fixed inset-0 top-14 z-30 bg-black/20"
            onClick={() => setMenuOpen(false)}
          />
          <div className="sm:hidden fixed top-14 left-0 right-0 z-40 border-b border-stone-200 bg-white/96 backdrop-blur-sm shadow-lg">
            <div className="px-3 py-2 space-y-1">
              {navItems.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <button
                    key={item.href}
                    onClick={() => navigate(item.href)}
                    className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
                      active ? 'bg-amber-100 text-amber-700' : 'text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
              <button
                onClick={() => { exitAdmin(); setMenuOpen(false) }}
                className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-red-500 hover:bg-red-50"
              >
                관리자 종료
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── 관리자 비밀번호 모달 ──────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setShowModal(false); setPw('') }}
        >
          <div
            className={`w-72 rounded-2xl bg-white p-6 shadow-2xl ${shake ? 'animate-shake' : ''}`}
            onClick={e => e.stopPropagation()}
          >
            <p className="mb-1 text-center text-base font-extrabold text-stone-800">관리자 인증</p>
            <p className="mb-5 text-center text-xs text-stone-400">관리자 비밀번호를 입력하세요</p>

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
                onClick={() => { setShowModal(false); setPw('') }}
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
