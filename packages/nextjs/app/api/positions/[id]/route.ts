import { NextRequest, NextResponse } from 'next/server'
import { enrichSinglePosition, discoverUserPositions } from '@arbme/core-lib'
import type { Position } from '@arbme/core-lib'
import { getDiscoveryCache, setDiscoveryCache } from '../_cache'

export const maxDuration = 30

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// ═══════════════════════════════════════════════════════════════════════════════
// Per-position enrichment cache
// ═══════════════════════════════════════════════════════════════════════════════

interface EnrichmentCacheEntry {
  position: Position
  lastUpdated: string
  timestamp: number
}

const MAX_ENRICHMENT_ENTRIES = 5000
const ENRICHMENT_TTL = 5 * 60_000  // 5 minutes

const enrichmentCache = new Map<string, EnrichmentCacheEntry>()

function enrichmentKey(wallet: string, id: string): string {
  return `${wallet.toLowerCase()}:${id}`
}

function getCachedEnrichment(wallet: string, id: string): EnrichmentCacheEntry | null {
  const key = enrichmentKey(wallet, id)
  const entry = enrichmentCache.get(key)
  if (!entry) return null

  if (Date.now() - entry.timestamp > ENRICHMENT_TTL) {
    enrichmentCache.delete(key)
    return null
  }

  // LRU
  enrichmentCache.delete(key)
  enrichmentCache.set(key, entry)
  return entry
}

function setCachedEnrichment(wallet: string, id: string, position: Position): EnrichmentCacheEntry {
  const key = enrichmentKey(wallet, id)
  const entry: EnrichmentCacheEntry = {
    position,
    lastUpdated: new Date().toISOString(),
    timestamp: Date.now(),
  }

  if (enrichmentCache.size >= MAX_ENRICHMENT_ENTRIES && !enrichmentCache.has(key)) {
    const oldest = enrichmentCache.keys().next().value
    if (oldest) enrichmentCache.delete(oldest)
  }
  enrichmentCache.set(key, entry)
  return entry
}

// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: positionId } = await params
    const searchParams = request.nextUrl.searchParams
    const wallet = searchParams.get('wallet')
    const refresh = searchParams.get('refresh') === 'true'

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 })
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 })
    }

    if (!positionId) {
      return NextResponse.json({ error: 'Missing position ID' }, { status: 400 })
    }

    // Check enrichment cache
    if (!refresh) {
      const cached = getCachedEnrichment(wallet, positionId)
      if (cached) {
        return NextResponse.json({
          wallet,
          position: cached.position,
          cached: true,
          lastUpdated: cached.lastUpdated,
        })
      }
    }

    // Find raw position from discovery cache — check both filtered and unfiltered
    let discoveryData = getDiscoveryCache(wallet, 'all') || getDiscoveryCache(wallet)

    if (!discoveryData) {
      // No discovery cache — run unfiltered discovery (fast, ~2s)
      console.log(`[positions/${positionId}] No discovery cache, running discovery for ${wallet}`)
      const result = await discoverUserPositions(wallet, ALCHEMY_KEY, { ecosystemOnly: false })
      setDiscoveryCache(wallet, result.summaries, result.rawPositions, 'all')
      discoveryData = { summaries: result.summaries, rawPositions: result.rawPositions, lastUpdated: new Date().toISOString(), timestamp: Date.now() }
    }

    const rawPosition = discoveryData.rawPositions.find(r => r.id === positionId)
    if (!rawPosition) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    // Enrich with timeout
    const ENRICH_TIMEOUT_MS = 15_000
    const position = await Promise.race([
      enrichSinglePosition(rawPosition, ALCHEMY_KEY),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Enrichment timed out')), ENRICH_TIMEOUT_MS)
      ),
    ])

    const entry = setCachedEnrichment(wallet, positionId, position)

    return NextResponse.json({
      wallet,
      position,
      cached: false,
      lastUpdated: entry.lastUpdated,
    })
  } catch (error: any) {
    console.error(`[positions/[id]] Error:`, error)
    return NextResponse.json(
      { error: error.message || 'Failed to enrich position' },
      { status: 500 }
    )
  }
}
