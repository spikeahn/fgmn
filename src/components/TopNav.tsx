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
      <nav className="sticky top-0 z-40 flex h-14 items-center border-b border-stone-200 bg-white/90 px-4 backdrop-blur-sm">

        {/* 로고 */}
        <span className="mr-4 select-none text-base font-black tracking-tight text-stone-800">
          FGMN
        </span>

        {/* 관리자 뱃지 */}
        {isAdmin && (
          <span className="mr-3 flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            관리자
          </span>
        )}

        {/* 페이지 탭 */}
        <div className="flex gap-1">
          {navItems.map(item => {
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

        {/* 우측 비밀 탭 (5회 → 관리자 로그인) */}
        <div
          className="ml-auto h-10 w-16 cursor-default select-none"
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
