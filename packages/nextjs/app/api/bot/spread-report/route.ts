import { NextRequest, NextResponse } from 'next/server'
import { fetchPools } from '@arbme/core-lib'

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY
const ARBME_SIGNER_UUID = process.env.ARBME_SIGNER_UUID
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface SpreadPool {
  pair: string
  spread: number
  price: number
  tvl: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  if (price >= 1) return `$${price.toFixed(2)}`
  if (price >= 0.01) return `$${price.toFixed(4)}`
  if (price >= 0.0001) return `$${price.toFixed(6)}`
  return `$${price.toFixed(8)}`
}

function formatSpread(spread: number): string {
  const sign = spread >= 0 ? '+' : ''
  return `${sign}${spread.toFixed(1)}%`
}

function getHeatEmoji(spread: number): string {
  if (Math.abs(spread) > 15) return ' 🔥🔥'
  if (Math.abs(spread) > 10) return ' 🔥'
  return ''
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cast Builder
// ═══════════════════════════════════════════════════════════════════════════════

function buildSpreadReportCast(
  wethPrice: number,
  clankerPrice: number,
  arbmePrice: number,
  topSpreads: SpreadPool[]
): string {
  const lines: string[] = []

  // Header with market context
  lines.push('📊 Hourly Market Pulse')
  lines.push('')
  lines.push(`ETH: ${formatPrice(wethPrice)}`)
  lines.push(`CLANKER: ${formatPrice(clankerPrice)}`)
  lines.push(`ARBME: ${formatPrice(arbmePrice)}`)
  lines.push('')

  // Top spreads
  if (topSpreads.length > 0) {
    lines.push('Top ARBME Spreads:')
    topSpreads.forEach((pool, i) => {
      const emoji = getHeatEmoji(pool.spread)
      lines.push(`${i + 1}. ${pool.pair} ${formatSpread(pool.spread)}${emoji}`)
    })
  } else {
    lines.push('No significant spreads detected')
  }

  lines.push('')
  lines.push('@nyor')

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Neynar Integration
// ═══════════════════════════════════════════════════════════════════════════════

async function castToFarcaster(text: string): Promise<{ success: boolean; hash?: string; error?: string }> {
  if (!NEYNAR_API_KEY || !ARBME_SIGNER_UUID) {
    return { success: false, error: 'Missing Neynar credentials' }
  }

  try {
    const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        signer_uuid: ARBME_SIGNER_UUID,
        text,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Bot] Neynar error:', error)
      return { success: false, error }
    }

    const data = await response.json()
    return { success: true, hash: data.cast?.hash }
  } catch (error) {
    console.error('[Bot] Cast error:', error)
    return { success: false, error: String(error) }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Handler
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch current pool data
    const poolData = await fetchPools(ALCHEMY_KEY)

    // Extract prices
    const wethPrice = poolData.tokenPrices?.WETH || 0
    const clankerPrice = poolData.tokenPrices?.CLANKER || 0
    const arbmePrice = parseFloat(poolData.arbmePrice) || 0

    // Calculate spreads for ARBME pools
    const arbmePools = poolData.pools.filter(p =>
      p.pair.toUpperCase().includes('ARBME') &&
      !p.pair.toUpperCase().includes('WETH')
    )

    const poolsWithSpread: SpreadPool[] = arbmePools
      .map(pool => {
        const poolPrice = parseFloat(pool.priceUsd) || 0
        const spread = arbmePrice > 0
          ? ((poolPrice - arbmePrice) / arbmePrice) * 100
          : 0
        return {
          pair: pool.pair,
          spread,
          price: poolPrice,
          tvl: pool.tvl,
        }
      })
      .filter(p => Math.abs(p.spread) > 3) // Only significant spreads
      .sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread))
      .slice(0, 3)

    // Build the cast
    const castText = buildSpreadReportCast(wethPrice, clankerPrice, arbmePrice, poolsWithSpread)

    console.log('[Bot] Generated cast:', castText)

    // Check if we should actually cast (dry run option)
    const dryRun = request.nextUrl.searchParams.get('dry') === 'true'

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        cast: castText,
        data: {
          wethPrice,
          clankerPrice,
          arbmePrice,
          spreads: poolsWithSpread,
        }
      })
    }

    // Cast to Farcaster
    const result = await castToFarcaster(castText)

    return NextResponse.json({
      success: result.success,
      cast: castText,
      hash: result.hash,
      error: result.error,
    })

  } catch (error) {
    console.error('[Bot] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate spread report' },
      { status: 500 }
    )
  }
}

// GET for health check / preview
export async function GET(request: NextRequest) {
  // Redirect to POST with dry run
  const url = new URL(request.url)
  url.searchParams.set('dry', 'true')

  return NextResponse.redirect(url, { status: 307 })
}
