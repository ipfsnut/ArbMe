/**
 * Position Cache — IndexedDB SWR layer for position data
 *
 * Show cached positions immediately, refresh in background,
 * gracefully handle RPC failures by keeping stale data visible.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Position } from '@/utils/types'

// ── Schema ──────────────────────────────────────────────────────────────────

interface PositionDB extends DBSchema {
  positions: {
    key: string // `${wallet}-${id}`
    value: Position & {
      _wallet: string
      _updatedAt: number
    }
    indexes: { 'by-wallet': string }
  }
  meta: {
    key: string // wallet address (lowercase)
    value: {
      lastRefresh: number
      wallet: string
      positionCount: number
    }
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

const DB_NAME = 'arbme-positions'
const DB_VERSION = 1
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

// ── DB singleton ────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<PositionDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PositionDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('positions')) {
          const store = db.createObjectStore('positions', { keyPath: '_key' as any })
          store.createIndex('by-wallet', '_wallet')
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
        }
      },
    })
  }
  return dbPromise
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface CacheResult {
  positions: Position[]
  isFresh: boolean
  lastRefresh: number | null
}

export async function getCachedPositions(wallet: string): Promise<CacheResult> {
  try {
    const db = await getDB()
    const w = wallet.toLowerCase()

    const meta = await db.get('meta', w)
    const isFresh = meta ? (Date.now() - meta.lastRefresh) < CACHE_TTL_MS : false

    const raw = await db.getAllFromIndex('positions', 'by-wallet', w)
    // Strip internal fields
    const positions: Position[] = raw.map(({ _wallet, _updatedAt, ...pos }) => {
      const { _key, ...clean } = pos as any
      return clean as Position
    })

    return { positions, isFresh, lastRefresh: meta?.lastRefresh ?? null }
  } catch {
    // IndexedDB not available (private browsing, webview eviction, etc.)
    return { positions: [], isFresh: false, lastRefresh: null }
  }
}

export async function setCachedPositions(wallet: string, positions: Position[]): Promise<void> {
  try {
    const db = await getDB()
    const w = wallet.toLowerCase()
    const now = Date.now()

    const tx = db.transaction(['positions', 'meta'], 'readwrite')
    const posStore = tx.objectStore('positions')
    const metaStore = tx.objectStore('meta')

    // Clear existing positions for this wallet
    const existingKeys = await posStore.index('by-wallet').getAllKeys(w)
    for (const key of existingKeys) {
      posStore.delete(key)
    }

    // Insert new positions
    for (const pos of positions) {
      posStore.put({
        ...pos,
        _key: `${w}-${pos.id}`,
        _wallet: w,
        _updatedAt: now,
      } as any)
    }

    // Update meta
    metaStore.put({
      lastRefresh: now,
      wallet: w,
      positionCount: positions.length,
    }, w)

    await tx.done
  } catch {
    // Silently fail — cache is best-effort
  }
}

export async function invalidateCache(wallet: string): Promise<void> {
  try {
    const db = await getDB()
    await db.delete('meta', wallet.toLowerCase())
  } catch {
    // Silently fail
  }
}

export function formatCacheAge(lastRefresh: number | null): string {
  if (!lastRefresh) return 'Never'

  const seconds = Math.floor((Date.now() - lastRefresh) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
