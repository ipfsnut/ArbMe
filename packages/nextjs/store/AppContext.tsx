'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import type { AppState } from '../utils/types'

interface AppContextType {
  state: AppState
  setState: (partial: Partial<AppState>) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setStateInternal] = useState<AppState>({
    wallet: null,
    pools: [],
    positions: [],
    globalStats: null,
    loading: false,
    error: null,
  })

  const setState = (partial: Partial<AppState>) => {
    setStateInternal(prev => ({ ...prev, ...partial }))
  }

  return (
    <AppContext.Provider value={{ state, setState }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppState() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppState must be used within AppProvider')
  }
  return context
}
