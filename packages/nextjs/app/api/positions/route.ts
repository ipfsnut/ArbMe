import { NextRequest, NextResponse } from 'next/server'
import { discoverUserPositions, fetchUserPositions } from '@arbme/core-lib'
import { getDiscoveryCache, setDiscoveryCache, invalidateDiscoveryCache } from './_cache'

export const maxDuration = 60

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const wallet = searchParams.get('wallet')
    const refresh = searchParams.get('refresh') === 'true'
    const mode = searchParams.get('mode') // 'full' returns enriched Position[] (backward compat)
    const filter = searchParams.get('filter') // 'all' = show all positions, default = ecosystem only
    const ecosystemOnly = filter !== 'all'

    if (!wallet) {
      return NextResponse.json(
        { error: 'Missing wallet address' },
        { status: 400 }
      )
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    // Backward compat: mode=full returns enriched positions (for MCP server etc.)
    if (mode === 'full') {
      if (refresh) invalidateDiscoveryCache(wallet)
      const FETCH_TIMEOUT_MS = 50_000
      const positions = await Promise.race([
        fetchUserPositions(wallet, ALCHEMY_KEY, { ecosystemOnly }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Position fetch timed out')), FETCH_TIMEOUT_MS)
        ),
      ])
      return NextResponse.json({
        wallet,
        positions,
        count: positions.length,
        cached: false,
        lastUpdated: new Date().toISOString(),
      })
    }

    // Default: return summaries (fast discovery)
    if (refresh) {
      invalidateDiscoveryCache(wallet)
    }

    const cached = getDiscoveryCache(wallet)
    if (cached) {
      return NextResponse.json({
        wallet,
        summaries: cached.summaries,
        count: cached.summaries.length,
        cached: true,
        lastUpdated: cached.lastUpdated,
      })
    }

    // Cache miss — discover positions
    const DISCOVER_TIMEOUT_MS = 20_000
    try {
      const result = await Promise.race([
        discoverUserPositions(wallet, ALCHEMY_KEY, { ecosystemOnly }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Discovery timed out')), DISCOVER_TIMEOUT_MS)
        ),
      ])

      const entry = setDiscoveryCache(wallet, result.summaries, result.rawPositions)

      return NextResponse.json({
        wallet,
        summaries: result.summaries,
        count: result.summaries.length,
        cached: false,
        lastUpdated: entry.lastUpdated,
      })
    } catch (fetchErr: any) {
      // Return stale cache if available
      const stale = getDiscoveryCache(wallet)
      if (stale) {
        console.warn(`[positions] Discovery failed (${fetchErr.message}), returning stale cache`)
        return NextResponse.json({
          wallet,
          summaries: stale.summaries,
          count: stale.summaries.length,
          cached: true,
          stale: true,
          lastUpdated: stale.lastUpdated,
        })
      }
      throw fetchErr
    }
  } catch (error: any) {
    console.error('[positions] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status: 500 }
    )
  }
}
