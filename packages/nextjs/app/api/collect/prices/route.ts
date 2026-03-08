import { NextRequest, NextResponse } from 'next/server'
import { getTokenPrices, ARBME, TOKENS } from '@arbme/core-lib'
import { recordPrices, getHistoryStats } from '@/lib/price-history'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
const CLANKER_ADDRESS = '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb'

/**
 * POST /api/collect/prices
 *
 * Cron-triggered endpoint to collect and store current prices.
 * Should be called hourly to build price history for VCV analysis.
 *
 * Optional auth via CRON_SECRET for security.
 */
export async function POST(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch prices for all tokens we track via the consolidated pricing service
    const priceMap = await getTokenPrices(
      [WETH_ADDRESS, ARBME.address, TOKENS.RATCHET, TOKENS.ABC, TOKENS.CLAWD, CLANKER_ADDRESS],
      ALCHEMY_KEY,
    )

    // Build prices object for recording
    const prices: Record<string, number> = {}

    const wethPrice = priceMap.get(WETH_ADDRESS.toLowerCase())
    if (wethPrice && wethPrice > 0) prices['ETH'] = wethPrice

    const clankerPrice = priceMap.get(CLANKER_ADDRESS.toLowerCase())
    if (clankerPrice && clankerPrice > 0) prices['CLANKER'] = clankerPrice

    const arbmePrice = priceMap.get(ARBME.address.toLowerCase())
    if (arbmePrice && arbmePrice > 0) prices['ARBME'] = arbmePrice

    const ratchetPrice = priceMap.get(TOKENS.RATCHET.toLowerCase())
    if (ratchetPrice && ratchetPrice > 0) prices['RATCHET'] = ratchetPrice

    const abcPrice = priceMap.get(TOKENS.ABC.toLowerCase())
    if (abcPrice && abcPrice > 0) prices['ABC'] = abcPrice

    const clawdPrice = priceMap.get(TOKENS.CLAWD.toLowerCase())
    if (clawdPrice && clawdPrice > 0) prices['CLAWD'] = clawdPrice

    // Record to history
    recordPrices(prices)

    // Get stats for response
    const stats = getHistoryStats()

    return NextResponse.json({
      success: true,
      recorded: Object.keys(prices).length,
      prices,
      stats,
    })

  } catch (error) {
    console.error('[PriceCollector] Error:', error)
    return NextResponse.json(
      { error: 'Failed to collect prices' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/collect/prices
 *
 * Returns current stats about stored price history.
 * Useful for debugging and monitoring.
 */
export async function GET() {
  const stats = getHistoryStats()

  return NextResponse.json({
    stats,
    note: 'POST to this endpoint to trigger price collection',
  })
}
