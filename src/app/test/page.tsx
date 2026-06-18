'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Result {
  table: string
  count: number | null
  error: string | null
}

export default function TestPage() {
  const [results, setResults] = useState<Result[]>([])
  const [done, setDone] = useState(false)
  const [url, setUrl] = useState('')

  useEffect(() => {
    setUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(없음)')

    async function run() {
      const tables = ['staffs', 'checklists', 'checklist_logs', 'schedules'] as const
      const out: Result[] = []

      for (const t of tables) {
        const { count, error } = await supabase
          .from(t)
          .select('*', { count: 'exact', head: true })

        out.push({ table: t, count: count ?? null, error: error?.message ?? null })
      }

      setResults(out)
      setDone(true)
    }

    run()
  }, [])

  return (
    <main className="min-h-screen bg-[#FAF8F5] p-8 font-mono text-sm">
      <h1 className="mb-6 text-xl font-bold text-stone-800">Supabase 연결 진단</h1>

      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">SUPABASE URL</p>
        <p className="mt-1 break-all text-stone-700">{url}</p>
      </div>

      {!done && <p className="text-stone-400">테스트 중...</p>}

      {done && (
        <div className="space-y-3">
          {results.map(r => (
            <div
              key={r.table}
              className={`rounded-xl border p-4 ${
                r.error
                  ? 'border-red-200 bg-red-50'
                  : r.count === 0
                  ? 'border-yellow-200 bg-yellow-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-700">{r.table}</span>
                {r.error ? (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">에러</span>
                ) : (
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${r.count! > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {r.count}행
                  </span>
                )}
              </div>
              {r.error && (
                <p className="mt-2 text-xs text-red-600">{r.error}</p>
              )}
            </div>
          ))}

          <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 text-xs text-stone-500 leading-6">
            <p className="font-bold text-stone-700 mb-2">결과 해석:</p>
            <p>🔴 <b>에러</b> → 테이블이 없거나 RLS가 막고 있음 → seed.sql 전체 실행 필요</p>
            <p>🟡 <b>0행</b> → 테이블은 있지만 비어있음 → seed.sql의 INSERT 부분만 다시 실행</p>
            <p>🟢 <b>n행</b> → 정상</p>
          </div>
        </div>
      )}
    </main>
  )
}
