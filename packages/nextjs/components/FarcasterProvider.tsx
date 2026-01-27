'use client'

import { useEffect } from 'react'

export function FarcasterProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    import('@farcaster/miniapp-sdk').then((mod) => {
      try {
        mod.default.actions.ready()
      } catch (e) {
        console.log('[FarcasterProvider] ready() failed:', e)
      }
    }).catch((e) => {
      console.log('[FarcasterProvider] SDK import failed:', e)
    })
  }, [])

  return <>{children}</>
}
