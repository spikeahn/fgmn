'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface AdminCtx {
  isAdmin: boolean
  enter: () => void
  exit: () => void
}

const AdminContext = createContext<AdminCtx>({ isAdmin: false, enter: () => {}, exit: () => {} })

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)
  return (
    <AdminContext.Provider value={{ isAdmin, enter: () => setIsAdmin(true), exit: () => setIsAdmin(false) }}>
      {children}
    </AdminContext.Provider>
  )
}

export const useAdmin = () => useContext(AdminContext)
