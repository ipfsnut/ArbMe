import { NextRequest, NextResponse } from 'next/server'
import { fetchUserPositions } from '@arbme/core-lib'
import type { Position } from '@arbme/core-lib'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// ═══════════════════════════════════════════════════════════════════════════════
// Position Cache — keyed by wallet, LRU-evicted at MAX_ENTRIES, manual refresh
// ═══════════════════════════════════════════════════════════════════════════════

interface CacheEntry {
  positions: Position[]
  lastUpdated: string // ISO timestamp
}

const MAX_CACHE_ENTRIES = 500
const cache = new Map<string, CacheEntry>()

function getCached(wallet: string): CacheEntry | null {
  const key = wallet.toLowerCase()
  const entry = cache.get(key)
  if (!entry) return null
  // Move to end (most recently accessed) for LRU ordering
  cache.delete(key)
  cache.set(key, entry)
  return entry
}

function setCache(wallet: string, positions: Position[]): CacheEntry {
  const key = wallet.toLowerCase()
  const entry: CacheEntry = { positions, lastUpdated: new Date().toISOString() }
  // Evict oldest entry if at capacity
  if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, entry)
  return entry
}

function invalidateCache(wallet: string) {
  cache.delete(wallet.toLowerCase())
}

// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const wallet = searchParams.get('wallet')
    const refresh = searchParams.get('refresh') === 'true'

    if (!wallet) {
      return NextResponse.json(
        { error: 'Missing wallet address' },
        { status: 400 }
      )
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    // Bust cache on explicit refresh (after user actions like collect fees / remove liquidity)
    if (refresh) {
      invalidateCache(wallet)
    }

    // Check cache — serves forever until manually refreshed
    const cached = getCached(wallet)
    if (cached) {
      return NextResponse.json({
        wallet,
        positions: cached.positions,
        count: cached.positions.length,
        cached: true,
        lastUpdated: cached.lastUpdated,
      })
    }

    // Cache miss — fetch fresh
    const positions = await fetchUserPositions(wallet, ALCHEMY_KEY)
    const entry = setCache(wallet, positions)

    return NextResponse.json({
      wallet,
      positions,
      count: positions.length,
      cached: false,
      lastUpdated: entry.lastUpdated,
    })
  } catch (error: any) {
    console.error('[positions] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status: 500 }
    )
  }
}
