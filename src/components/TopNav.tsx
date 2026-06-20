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

  const navItems = isAdmin ? NAV_ADMIN : NAV_BASE

  return (
    <>
      {/* ── 네비게이션 바 ─────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-stone-200 bg-white/90 px-3 backdrop-blur-sm">

        {/* 로고 - 항상 고정 */}
        <span className="shrink-0 select-none text-sm font-black tracking-tight text-stone-800 sm:text-base">
          FGMN
        </span>

        {/* 중앙 스크롤 영역: 뱃지 + 탭 + 종료 */}
        <div className="flex flex-1 min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]">
          {/* 관리자 뱃지 */}
          {isAdmin && (
            <span className="shrink-0 mr-1 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span className="hidden sm:inline">관리자</span>
            </span>
          )}

          {/* 페이지 탭 */}
          {navItems.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm
                  ${active
                    ? 'bg-amber-100 text-amber-700'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
                  }`}
              >
                {item.label}
              </button>
            )
          })}

          {/* 관리자 종료 버튼 */}
          {isAdmin && (
            <button
              onClick={exitAdmin}
              className="shrink-0 ml-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            >
              종료
            </button>
          )}
        </div>

        {/* 우측 비밀 탭 (5회 → 관리자 로그인) - 항상 고정 */}
        <div
          className="shrink-0 h-10 w-10 cursor-default select-none"
          onPointerDown={handleRightTap}
          aria-hidden
        />
      </nav>

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
