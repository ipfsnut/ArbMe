/**
 * Position Cache — IndexedDB SWR layer for position data
 *
 * v2: Dual-store schema for progressive loading
 * - summaries: fast discovery data (30min TTL)
 * - enriched: individual enriched positions (10min TTL)
 */

import type { DBSchema, IDBPDatabase } from 'idb'
import type { Position, PositionSummary } from '@/utils/types'

// ── Schema ──────────────────────────────────────────────────────────────────

interface PositionDBv2 extends DBSchema {
  summaries: {
    key: string // `${wallet}-${id}`
    value: PositionSummary & {
      _wallet: string
      _updatedAt: number
    }
    indexes: { 'by-wallet': string }
  }
  enriched: {
    key: string // `${wallet}-${id}`
    value: Position & {
      _wallet: string
      _updatedAt: number
    }
    indexes: { 'by-wallet': string }
  }
  meta: {
    key: string // `${wallet}:summaries` or `${wallet}:enriched:${id}`
    value: {
      lastRefresh: number
      wallet: string
      count?: number
    }
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

const DB_NAME = 'arbme-positions'
const DB_VERSION = 2
const SUMMARY_TTL_MS = 30 * 60 * 1000   // 30 minutes
const ENRICHED_TTL_MS = 10 * 60 * 1000  // 10 minutes

// ── DB singleton ────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<PositionDBv2>> | null = null

function getDB(): Promise<IDBPDatabase<PositionDBv2>> | null {
  if (typeof indexedDB === 'undefined') return null

  if (!dbPromise) {
    dbPromise = import('idb').then(({ openDB }) =>
      openDB<PositionDBv2>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
          // Delete old v1 stores
          if (oldVersion < 2) {
            if (db.objectStoreNames.contains('positions' as any)) {
              db.deleteObjectStore('positions' as any)
            }
            if (db.objectStoreNames.contains('meta')) {
              db.deleteObjectStore('meta')
            }
          }

          // Create v2 stores
          if (!db.objectStoreNames.contains('summaries')) {
            const store = db.createObjectStore('summaries', { keyPath: '_key' as any })
            store.createIndex('by-wallet', '_wallet')
          }
          if (!db.objectStoreNames.contains('enriched')) {
            const store = db.createObjectStore('enriched', { keyPath: '_key' as any })
            store.createIndex('by-wallet', '_wallet')
          }
          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta')
          }
        },
      })
    )
  }
  return dbPromise
}

// ── Summaries API ───────────────────────────────────────────────────────────

export interface SummaryCacheResult {
  summaries: PositionSummary[]
  isFresh: boolean
  lastDiscovery: number | null
}

export async function getCachedSummaries(wallet: string): Promise<SummaryCacheResult> {
  try {
    const dbP = getDB()
    if (!dbP) return { summaries: [], isFresh: false, lastDiscovery: null }
    const db = await dbP
    const w = wallet.toLowerCase()

    const meta = await db.get('meta', `${w}:summaries`)
    const isFresh = meta ? (Date.now() - meta.lastRefresh) < SUMMARY_TTL_MS : false

    const raw = await db.getAllFromIndex('summaries', 'by-wallet', w)
    const summaries: PositionSummary[] = raw.map(({ _wallet, _updatedAt, ...pos }) => {
      const { _key, ...clean } = pos as any
      return clean as PositionSummary
    })

    return { summaries, isFresh, lastDiscovery: meta?.lastRefresh ?? null }
  } catch {
    return { summaries: [], isFresh: false, lastDiscovery: null }
  }
}

export async function setCachedSummaries(wallet: string, summaries: PositionSummary[]): Promise<void> {
  try {
    const dbP = getDB()
    if (!dbP) return
    const db = await dbP
    const w = wallet.toLowerCase()
    const now = Date.now()

    const tx = db.transaction(['summaries', 'meta'], 'readwrite')
    const store = tx.objectStore('summaries')
    const metaStore = tx.objectStore('meta')

    // Clear existing summaries for this wallet
    const existingKeys = await store.index('by-wallet').getAllKeys(w)
    for (const key of existingKeys) {
      store.delete(key)
    }

    // Insert new summaries
    for (const s of summaries) {
      store.put({
        ...s,
        _key: `${w}-${s.id}`,
        _wallet: w,
        _updatedAt: now,
      } as any)
    }

    metaStore.put({ lastRefresh: now, wallet: w, count: summaries.length }, `${w}:summaries`)
    await tx.done
  } catch {
    // Silently fail
  }
}

// ── Enriched Positions API ──────────────────────────────────────────────────

export async function getCachedEnrichedPosition(wallet: string, positionId: string): Promise<Position | null> {
  try {
    const dbP = getDB()
    if (!dbP) return null
    const db = await dbP
    const w = wallet.toLowerCase()
    const key = `${w}-${positionId}`

    const meta = await db.get('meta', `${w}:enriched:${positionId}`)
    if (!meta || (Date.now() - meta.lastRefresh) > ENRICHED_TTL_MS) return null

    const raw = await db.get('enriched', key)
    if (!raw) return null

    const { _wallet, _updatedAt, _key, ...clean } = raw as any
    return clean as Position
  } catch {
    return null
  }
}

export async function getCachedEnrichedPositions(wallet: string): Promise<Map<string, Position>> {
  try {
    const dbP = getDB()
    if (!dbP) return new Map()
    const db = await dbP
    const w = wallet.toLowerCase()

    const raw = await db.getAllFromIndex('enriched', 'by-wallet', w)
    const map = new Map<string, Position>()
    const now = Date.now()

    for (const entry of raw) {
      const metaKey = `${w}:enriched:${entry.id}`
      const meta = await db.get('meta', metaKey)
      if (meta && (now - meta.lastRefresh) <= ENRICHED_TTL_MS) {
        const { _wallet, _updatedAt, _key, ...clean } = entry as any
        map.set(entry.id, clean as Position)
      }
    }

    return map
  } catch {
    return new Map()
  }
}

export async function setCachedEnrichedPosition(wallet: string, position: Position): Promise<void> {
  try {
    const dbP = getDB()
    if (!dbP) return
    const db = await dbP
    const w = wallet.toLowerCase()
    const now = Date.now()

    const tx = db.transaction(['enriched', 'meta'], 'readwrite')
    tx.objectStore('enriched').put({
      ...position,
      _key: `${w}-${position.id}`,
      _wallet: w,
      _updatedAt: now,
    } as any)
    tx.objectStore('meta').put({ lastRefresh: now, wallet: w }, `${w}:enriched:${position.id}`)
    await tx.done
  } catch {
    // Silently fail
  }
}

// ── Invalidation API ────────────────────────────────────────────────────────

export async function invalidateSummaries(wallet: string): Promise<void> {
  try {
    const dbP = getDB()
    if (!dbP) return
    const db = await dbP
    await db.delete('meta', `${wallet.toLowerCase()}:summaries`)
  } catch {
    // Silently fail
  }
}

export async function invalidateEnrichedPosition(wallet: string, positionId: string): Promise<void> {
  try {
    const dbP = getDB()
    if (!dbP) return
    const db = await dbP
    const w = wallet.toLowerCase()
    await db.delete('meta', `${w}:enriched:${positionId}`)
    await db.delete('enriched', `${w}-${positionId}`)
  } catch {
    // Silently fail
  }
}

export async function invalidateAll(wallet: string): Promise<void> {
  try {
    const dbP = getDB()
    if (!dbP) return
    const db = await dbP
    const w = wallet.toLowerCase()

    // Delete summaries meta
    await db.delete('meta', `${w}:summaries`)

    // Delete all enriched positions and their meta keys for this wallet
    const tx = db.transaction(['enriched', 'meta'], 'readwrite')
    const enrichedStore = tx.objectStore('enriched')
    const metaStore = tx.objectStore('meta')

    const enrichedKeys = await enrichedStore.index('by-wallet').getAllKeys(w)
    for (const key of enrichedKeys) {
      enrichedStore.delete(key)
      // key format: `wallet-positionId`
      const posId = (key as string).slice(w.length + 1)
      metaStore.delete(`${w}:enriched:${posId}`)
    }

    // Delete all summaries for this wallet
    const summaryTx = db.transaction('summaries', 'readwrite')
    const summaryStore = summaryTx.objectStore('summaries')
    const summaryKeys = await summaryStore.index('by-wallet').getAllKeys(w)
    for (const key of summaryKeys) {
      summaryStore.delete(key)
    }

    await tx.done
    await summaryTx.done
  } catch {
    // Silently fail
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

export function formatCacheAge(lastRefresh: number | null): string {
  if (!lastRefresh) return 'Never'

  const seconds = Math.floor((Date.now() - lastRefresh) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// ── Deprecated v1 API (kept for usePositions backward compat) ───────────────

/** @deprecated Use getCachedSummaries + getCachedEnrichedPositions instead */
export async function getCachedPositions(wallet: string): Promise<{
  positions: Position[]
  isFresh: boolean
  lastRefresh: number | null
}> {
  const enriched = await getCachedEnrichedPositions(wallet)
  const { lastDiscovery } = await getCachedSummaries(wallet)
  return {
    positions: Array.from(enriched.values()),
    isFresh: enriched.size > 0 && lastDiscovery !== null && (Date.now() - lastDiscovery) < SUMMARY_TTL_MS,
    lastRefresh: lastDiscovery,
  }
}

/** @deprecated Use setCachedSummaries + setCachedEnrichedPosition instead */
export async function setCachedPositions(wallet: string, positions: Position[]): Promise<void> {
  for (const pos of positions) {
    await setCachedEnrichedPosition(wallet, pos)
  }
}

/** @deprecated Use invalidateAll instead */
export async function invalidateCache(wallet: string): Promise<void> {
  await invalidateAll(wallet)
}
