'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getCachedPositions,
  setCachedPositions,
  invalidateCache as invalidateCacheStore,
  formatCacheAge,
} from '@/lib/position-cache'
import type { Position } from '@/utils/types'

const API_BASE = '/api'

export interface UsePositionsResult {
  positions: Position[]
  loading: boolean       // Initial load (no cache yet)
  refreshing: boolean    // Background refresh in progress
  error: string | null
  lastRefresh: string    // "2m ago", "Just now", etc.
  refresh: () => Promise<void>
  invalidate: () => Promise<void>
}

interface ApiResponse {
  positions: Position[]
  lastUpdated?: string
}

async function fetchPositionsFromApi(wallet: string, bustCache = false): Promise<ApiResponse> {
  const url = `${API_BASE}/positions?wallet=${wallet}${bustCache ? '&refresh=true' : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch positions')
  const data = await res.json()
  return {
    positions: data.positions || [],
    lastUpdated: data.lastUpdated,
  }
}

export function usePositions(wallet: string | null): UsePositionsResult {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)

  // Track the current wallet to avoid stale updates
  const walletRef = useRef(wallet)
  walletRef.current = wallet

  const refresh = useCallback(async () => {
    if (!walletRef.current) return

    const w = walletRef.current
    setRefreshing(true)
    setError(null)

    try {
      // Bust server cache so we get fresh on-chain data
      const { positions: fresh, lastUpdated } = await fetchPositionsFromApi(w, true)
      if (walletRef.current === w) {
        setPositions(fresh)
        await setCachedPositions(w, fresh)
        const ts = lastUpdated ? new Date(lastUpdated).getTime() : Date.now()
        setLastRefresh(ts)
      }
    } catch (e: any) {
      if (walletRef.current === w) {
        setError(e.message || 'Refresh failed')
        // Keep showing cached data — don't clear positions
      }
    } finally {
      if (walletRef.current === w) {
        setRefreshing(false)
      }
    }
  }, [])

  const invalidate = useCallback(async () => {
    if (!walletRef.current) return
    await invalidateCacheStore(walletRef.current)

    // Bust server cache too
    const w = walletRef.current
    setRefreshing(true)
    setError(null)

    try {
      const { positions: fresh, lastUpdated } = await fetchPositionsFromApi(w, true)
      if (walletRef.current === w) {
        setPositions(fresh)
        await setCachedPositions(w, fresh)
        const ts = lastUpdated ? new Date(lastUpdated).getTime() : Date.now()
        setLastRefresh(ts)
      }
    } catch (e: any) {
      if (walletRef.current === w) {
        setError(e.message || 'Refresh failed')
      }
    } finally {
      if (walletRef.current === w) {
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!wallet) {
      setPositions([])
      setLoading(false)
      setError(null)
      setLastRefresh(null)
      return
    }

    let cancelled = false
    const w = wallet

    async function load() {
      // 1. Load from IndexedDB cache immediately
      const cached = await getCachedPositions(w)

      if (cancelled) return

      if (cached.positions.length > 0) {
        // Show cached data and stop — no auto-refresh
        setPositions(cached.positions)
        setLastRefresh(cached.lastRefresh)
        setLoading(false)
        return
      }

      // 2. Cache completely empty — first visit for this wallet, fetch from API
      try {
        const { positions: fresh, lastUpdated } = await fetchPositionsFromApi(w)
        if (cancelled) return
        setPositions(fresh)
        await setCachedPositions(w, fresh)
        const ts = lastUpdated ? new Date(lastUpdated).getTime() : Date.now()
        setLastRefresh(ts)
      } catch (e: any) {
        if (cancelled) return
        setError(e.message || 'Failed to load positions')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => { cancelled = true }
  }, [wallet])

  return {
    positions,
    loading,
    refreshing,
    error,
    lastRefresh: formatCacheAge(lastRefresh),
    refresh,
    invalidate,
  }
}
