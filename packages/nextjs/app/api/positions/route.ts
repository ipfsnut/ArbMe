import { NextRequest, NextResponse } from 'next/server'
import { fetchUserPositions } from '@arbme/core-lib'
import type { Position } from '@arbme/core-lib'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// ═══════════════════════════════════════════════════════════════════════════════
// Position Cache — keyed by wallet, 60s TTL, stale-while-revalidate at 30s
// ═══════════════════════════════════════════════════════════════════════════════

interface CacheEntry {
  positions: Position[]
  timestamp: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 60_000       // 60s — serve cached data within this window
const STALE_THRESHOLD = 30_000 // 30s — trigger background refresh after this

function getCached(wallet: string): CacheEntry | null {
  const entry = cache.get(wallet.toLowerCase())
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(wallet.toLowerCase())
    return null
  }
  return entry
}

function setCache(wallet: string, positions: Position[]) {
  cache.set(wallet.toLowerCase(), { positions, timestamp: Date.now() })
}

function invalidateCache(wallet: string) {
  cache.delete(wallet.toLowerCase())
}

// Background refresh — fire and forget, don't block the response
function backgroundRefresh(wallet: string) {
  fetchUserPositions(wallet, ALCHEMY_KEY)
    .then(positions => setCache(wallet, positions))
    .catch(err => console.error('[positions] Background refresh failed:', err))
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

    // Check cache
    const cached = getCached(wallet)
    if (cached) {
      // If stale (>30s), trigger background refresh for next request
      if (Date.now() - cached.timestamp > STALE_THRESHOLD) {
        backgroundRefresh(wallet)
      }

      return NextResponse.json({
        wallet,
        positions: cached.positions,
        count: cached.positions.length,
        cached: true,
      })
    }

    // Cache miss — fetch fresh
    const positions = await fetchUserPositions(wallet, ALCHEMY_KEY)
    setCache(wallet, positions)

    return NextResponse.json({
      wallet,
      positions,
      count: positions.length,
    })
  } catch (error: any) {
    console.error('[positions] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status: 500 }
    )
  }
}
