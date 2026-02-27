/**
 * Shared server-side discovery cache for positions API.
 * Used by both /api/positions and /api/positions/[id].
 *
 * Cache keys include filter type so ecosystem-only and all-positions
 * results don't collide for the same wallet.
 */

import type { PositionSummary, RawPosition } from '@arbme/core-lib'

export interface DiscoveryCacheEntry {
  summaries: PositionSummary[]
  rawPositions: RawPosition[]
  lastUpdated: string
  timestamp: number
}

const MAX_CACHE_ENTRIES = 500
const DISCOVERY_CACHE_TTL = 10 * 60_000  // 10 minutes

const discoveryCache = new Map<string, DiscoveryCacheEntry>()

function cacheKey(wallet: string, filter?: string): string {
  return `${wallet.toLowerCase()}:${filter || 'ecosystem'}`
}

export function getDiscoveryCache(wallet: string, filter?: string): DiscoveryCacheEntry | null {
  const key = cacheKey(wallet, filter)
  const entry = discoveryCache.get(key)
  if (!entry) return null

  if (Date.now() - entry.timestamp > DISCOVERY_CACHE_TTL) {
    discoveryCache.delete(key)
    return null
  }

  // LRU: move to end
  discoveryCache.delete(key)
  discoveryCache.set(key, entry)
  return entry
}

export function setDiscoveryCache(wallet: string, summaries: PositionSummary[], rawPositions: RawPosition[], filter?: string): DiscoveryCacheEntry {
  const key = cacheKey(wallet, filter)
  const entry: DiscoveryCacheEntry = {
    summaries,
    rawPositions,
    lastUpdated: new Date().toISOString(),
    timestamp: Date.now(),
  }

  if (discoveryCache.size >= MAX_CACHE_ENTRIES && !discoveryCache.has(key)) {
    const oldest = discoveryCache.keys().next().value
    if (oldest) discoveryCache.delete(oldest)
  }
  discoveryCache.set(key, entry)
  return entry
}

export function invalidateDiscoveryCache(wallet: string, filter?: string): void {
  // Invalidate both filtered and unfiltered for this wallet
  const w = wallet.toLowerCase()
  discoveryCache.delete(`${w}:ecosystem`)
  discoveryCache.delete(`${w}:all`)
}
