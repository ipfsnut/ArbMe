'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getCachedSummaries,
  setCachedSummaries,
  getCachedEnrichedPositions,
  setCachedEnrichedPosition,
  invalidateAll,
  invalidateEnrichedPosition,
  formatCacheAge,
} from '@/lib/position-cache'
import type { Position, PositionSummary } from '@/utils/types'

const API_BASE = '/api'
const FETCH_TIMEOUT_MS = 20_000
const MAX_CONCURRENT_ENRICHMENTS = 3

export interface UsePositionListResult {
  summaries: PositionSummary[]
  enrichedMap: Map<string, Position>
  loading: boolean
  refreshing: boolean
  error: string | null
  lastRefresh: string
  refresh: () => Promise<void>
  refreshPosition: (id: string) => Promise<void>
  enrichBatch: (ids: string[]) => void
}

interface SummaryApiResponse {
  summaries: PositionSummary[]
  lastUpdated?: string
}

async function fetchSummariesFromApi(wallet: string, bustCache = false): Promise<SummaryApiResponse> {
  const url = `${API_BASE}/positions?wallet=${wallet}${bustCache ? '&refresh=true' : ''}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error('Failed to fetch positions')
    const data = await res.json()
    return { summaries: data.summaries || [], lastUpdated: data.lastUpdated }
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('Request timed out')
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchEnrichedPosition(wallet: string, positionId: string, bustCache = false): Promise<Position> {
  const url = `${API_BASE}/positions/${encodeURIComponent(positionId)}?wallet=${wallet}${bustCache ? '&refresh=true' : ''}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error('Failed to enrich position')
  const data = await res.json()
  return data.position
}

export function usePositionList(wallet: string | null): UsePositionListResult {
  const [summaries, setSummaries] = useState<PositionSummary[]>([])
  const [enrichedMap, setEnrichedMap] = useState<Map<string, Position>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)

  const walletRef = useRef(wallet)
  walletRef.current = wallet

  // Enrichment queue internals
  const queueRef = useRef<string[]>([])
  const activeCountRef = useRef(0)
  const enrichedMapRef = useRef(enrichedMap)
  enrichedMapRef.current = enrichedMap

  const processQueue = useCallback(async () => {
    const w = walletRef.current
    if (!w) return

    while (queueRef.current.length > 0 && activeCountRef.current < MAX_CONCURRENT_ENRICHMENTS) {
      const id = queueRef.current.shift()
      if (!id) break

      // Skip if already enriched
      if (enrichedMapRef.current.has(id)) continue

      activeCountRef.current++

      // Fire and forget — updates state on completion
      fetchEnrichedPosition(w, id)
        .then(async (position) => {
          if (walletRef.current !== w) return
          await setCachedEnrichedPosition(w, position)
          setEnrichedMap(prev => {
            const next = new Map(prev)
            next.set(id, position)
            return next
          })
        })
        .catch((err) => {
          console.warn(`[usePositionList] Enrichment failed for ${id}:`, err.message)
        })
        .finally(() => {
          activeCountRef.current--
          // Process next in queue
          processQueue()
        })
    }
  }, [])

  const enrichBatch = useCallback((ids: string[]) => {
    // Add IDs not already queued or enriched
    const existing = new Set(queueRef.current)
    for (const id of ids) {
      if (!existing.has(id) && !enrichedMapRef.current.has(id)) {
        queueRef.current.push(id)
        existing.add(id)
      }
    }
    processQueue()
  }, [processQueue])

  const refresh = useCallback(async () => {
    if (!walletRef.current) return
    const w = walletRef.current

    setRefreshing(true)
    setError(null)

    try {
      const { summaries: fresh, lastUpdated } = await fetchSummariesFromApi(w, true)
      if (walletRef.current !== w) return
      setSummaries(fresh)
      await setCachedSummaries(w, fresh)
      const ts = lastUpdated ? new Date(lastUpdated).getTime() : Date.now()
      setLastRefresh(ts)

      // Clear enriched data so it re-enriches
      setEnrichedMap(new Map())
      queueRef.current = []
    } catch (e: any) {
      if (walletRef.current === w) {
        setError(e.message || 'Refresh failed')
      }
    } finally {
      if (walletRef.current === w) setRefreshing(false)
    }
  }, [])

  const refreshPosition = useCallback(async (id: string) => {
    const w = walletRef.current
    if (!w) return

    try {
      await invalidateEnrichedPosition(w, id)
      // Remove from current map so card shows loading
      setEnrichedMap(prev => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      const position = await fetchEnrichedPosition(w, id, true)
      if (walletRef.current !== w) return
      await setCachedEnrichedPosition(w, position)
      setEnrichedMap(prev => {
        const next = new Map(prev)
        next.set(id, position)
        return next
      })
    } catch (err: any) {
      console.warn(`[usePositionList] refreshPosition failed for ${id}:`, err.message)
    }
  }, [])

  useEffect(() => {
    if (!wallet) {
      setSummaries([])
      setEnrichedMap(new Map())
      setLoading(false)
      setError(null)
      setLastRefresh(null)
      return
    }

    let cancelled = false
    const w = wallet

    async function load() {
      // 1. Load summaries from IndexedDB cache
      const cached = await getCachedSummaries(w)

      if (cancelled) return

      if (cached.summaries.length > 0) {
        setSummaries(cached.summaries)
        setLastRefresh(cached.lastDiscovery)
        setLoading(false)

        // Load any cached enriched positions
        const cachedEnriched = await getCachedEnrichedPositions(w)
        if (!cancelled && cachedEnriched.size > 0) {
          setEnrichedMap(cachedEnriched)
        }

        if (cached.isFresh) return
        // Stale — refresh in background
        setRefreshing(true)
      }

      // 2. Fetch from API
      try {
        const { summaries: fresh, lastUpdated } = await fetchSummariesFromApi(w)
        if (cancelled) return
        setSummaries(fresh)
        await setCachedSummaries(w, fresh)
        const ts = lastUpdated ? new Date(lastUpdated).getTime() : Date.now()
        setLastRefresh(ts)
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load positions')
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [wallet])

  return {
    summaries,
    enrichedMap,
    loading,
    refreshing,
    error,
    lastRefresh: formatCacheAge(lastRefresh),
    refresh,
    refreshPosition,
    enrichBatch,
  }
}
