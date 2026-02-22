'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getCachedEnrichedPosition,
  setCachedEnrichedPosition,
  invalidateEnrichedPosition,
  invalidateAll,
  formatCacheAge,
} from '@/lib/position-cache'
import type { Position } from '@/utils/types'

const API_BASE = '/api'

export interface UsePositionResult {
  position: Position | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  invalidate: () => Promise<void>
}

async function fetchEnrichedPosition(wallet: string, positionId: string, bustCache = false): Promise<Position> {
  const url = `${API_BASE}/positions/${encodeURIComponent(positionId)}?wallet=${wallet}${bustCache ? '&refresh=true' : ''}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error('Failed to load position')
  const data = await res.json()
  return data.position
}

export function usePosition(positionId: string | null, wallet: string | null): UsePositionResult {
  const [position, setPosition] = useState<Position | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const walletRef = useRef(wallet)
  walletRef.current = wallet
  const idRef = useRef(positionId)
  idRef.current = positionId

  const refresh = useCallback(async () => {
    const w = walletRef.current
    const id = idRef.current
    if (!w || !id) return

    setLoading(true)
    setError(null)

    try {
      await invalidateEnrichedPosition(w, id)
      const pos = await fetchEnrichedPosition(w, id, true)
      if (walletRef.current === w && idRef.current === id) {
        setPosition(pos)
        await setCachedEnrichedPosition(w, pos)
      }
    } catch (e: any) {
      if (walletRef.current === w && idRef.current === id) {
        setError(e.message || 'Refresh failed')
      }
    } finally {
      if (walletRef.current === w && idRef.current === id) {
        setLoading(false)
      }
    }
  }, [])

  const invalidate = useCallback(async () => {
    const w = walletRef.current
    if (!w) return
    await invalidateAll(w)

    // Re-fetch
    const id = idRef.current
    if (!id) return

    setLoading(true)
    setError(null)

    try {
      const pos = await fetchEnrichedPosition(w, id, true)
      if (walletRef.current === w && idRef.current === id) {
        setPosition(pos)
        await setCachedEnrichedPosition(w, pos)
      }
    } catch (e: any) {
      if (walletRef.current === w && idRef.current === id) {
        setError(e.message || 'Refresh failed')
      }
    } finally {
      if (walletRef.current === w && idRef.current === id) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!wallet || !positionId) {
      setPosition(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const w = wallet
    const id = positionId

    async function load() {
      // 1. Check IndexedDB cache
      const cached = await getCachedEnrichedPosition(w, id)
      if (cancelled) return

      if (cached) {
        setPosition(cached)
        setLoading(false)
        return
      }

      // 2. Fetch from API
      try {
        const pos = await fetchEnrichedPosition(w, id)
        if (cancelled) return
        setPosition(pos)
        await setCachedEnrichedPosition(w, pos)
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load position')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [wallet, positionId])

  return { position, loading, error, refresh, invalidate }
}
