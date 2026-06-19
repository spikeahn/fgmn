'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

interface AdminCtx {
  isAdmin: boolean
  enter: () => void
  exit: () => void
}

const AdminContext = createContext<AdminCtx>({ isAdmin: false, enter: () => {}, exit: () => {} })

const KEY = 'fgmn_admin'

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    setIsAdmin(sessionStorage.getItem(KEY) === '1')
  }, [])

  const enter = useCallback(() => {
    sessionStorage.setItem(KEY, '1')
    setIsAdmin(true)
  }, [])

  const exit = useCallback(() => {
    sessionStorage.removeItem(KEY)
    setIsAdmin(false)
  }, [])

  return (
    <AdminContext.Provider value={{ isAdmin, enter, exit }}>
      {children}
    </AdminContext.Provider>
  )
}

export const useAdmin = () => useContext(AdminContext)
