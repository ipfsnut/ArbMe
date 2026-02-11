import { NextRequest, NextResponse } from 'next/server'
import { fetchUserPositions } from '@arbme/core-lib'
import type { Position } from '@arbme/core-lib'

export const maxDuration = 60

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// ═══════════════════════════════════════════════════════════════════════════════
// Position Cache — quality-aware: good results cached long, bad results short
// ═══════════════════════════════════════════════════════════════════════════════

interface CacheEntry {
  positions: Position[]
  lastUpdated: string // ISO timestamp
  timestamp: number
  quality: 'good' | 'partial' // good = most positions have prices
}

const MAX_CACHE_ENTRIES = 500
const GOOD_CACHE_TTL = 60 * 60_000    // 1 hour — results with prices
const PARTIAL_CACHE_TTL = 60_000       // 1 minute — results missing prices (retry soon)

const cache = new Map<string, CacheEntry>()

function assessQuality(positions: Position[]): 'good' | 'partial' {
  if (positions.length === 0) return 'good'
  const priced = positions.filter(p => p.liquidityUsd > 0).length
  return priced >= positions.length * 0.5 ? 'good' : 'partial'
}

function getCached(wallet: string): CacheEntry | null {
  const key = wallet.toLowerCase()
  const entry = cache.get(key)
  if (!entry) return null

  const age = Date.now() - entry.timestamp
  const ttl = entry.quality === 'good' ? GOOD_CACHE_TTL : PARTIAL_CACHE_TTL

  if (age > ttl) {
    cache.delete(key)
    return null
  }

  // LRU: move to end
  cache.delete(key)
  cache.set(key, entry)
  return entry
}

function setCache(wallet: string, positions: Position[]): CacheEntry {
  const key = wallet.toLowerCase()
  const quality = assessQuality(positions)
  const entry: CacheEntry = {
    positions,
    lastUpdated: new Date().toISOString(),
    timestamp: Date.now(),
    quality,
  }

  if (quality === 'partial') {
    console.log(`[positions] Caching ${positions.length} positions as PARTIAL (short TTL) — pricing incomplete`)
  }

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

    // Bust cache on explicit refresh
    if (refresh) {
      invalidateCache(wallet)
    }

    // Check cache
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
