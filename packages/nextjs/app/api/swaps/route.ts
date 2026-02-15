import { NextRequest, NextResponse } from 'next/server'
import { getRecentSwaps, SwapEvent } from '@/lib/swap-store'
import { KNOWN_TOKENS } from '@arbme/core-lib'

// Derive TOKEN_INFO from canonical KNOWN_TOKENS
const TOKEN_INFO: Record<string, { symbol: string; decimals: number }> = Object.fromEntries(
  Object.entries(KNOWN_TOKENS).map(([addr, t]) => [addr, { symbol: t.symbol, decimals: t.decimals }])
)

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface EnrichedSwap extends SwapEvent {
  tokenInInfo?: { symbol: string; decimals: number }
  tokenOutInfo?: { symbol: string; decimals: number }
  formattedAmountIn?: string
  formattedAmountOut?: string
  explorerUrl: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function formatAmount(amount: string, decimals: number): string {
  try {
    const value = BigInt(amount)
    const divisor = BigInt(10 ** decimals)
    const whole = value / divisor
    const remainder = value % divisor

    if (remainder === BigInt(0)) {
      return whole.toString()
    }

    const remainderStr = remainder.toString().padStart(decimals, '0')
    const trimmed = remainderStr.replace(/0+$/, '')

    return `${whole}.${trimmed}`
  } catch {
    return amount
  }
}

function enrichSwap(swap: SwapEvent): EnrichedSwap {
  const tokenInAddr = swap.tokenIn.toLowerCase()
  const tokenOutAddr = swap.tokenOut.toLowerCase()

  const tokenInInfo = TOKEN_INFO[tokenInAddr]
  const tokenOutInfo = TOKEN_INFO[tokenOutAddr]

  return {
    ...swap,
    tokenInInfo,
    tokenOutInfo,
    formattedAmountIn: tokenInInfo
      ? formatAmount(swap.amountIn, tokenInInfo.decimals)
      : swap.amountIn,
    formattedAmountOut: tokenOutInfo
      ? formatAmount(swap.amountOut, tokenOutInfo.decimals)
      : swap.amountOut,
    explorerUrl: `https://basescan.org/tx/${swap.txHash}`,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Handler
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // Parse query params
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const token = searchParams.get('token')?.toLowerCase()
  const pool = searchParams.get('pool')?.toLowerCase()

  try {
    let swaps = getRecentSwaps(100) // Get all, then filter

    // Filter by token if specified
    if (token) {
      swaps = swaps.filter(
        s =>
          s.tokenIn.toLowerCase() === token ||
          s.tokenOut.toLowerCase() === token
      )
    }

    // Filter by pool if specified
    if (pool) {
      swaps = swaps.filter(s => s.poolAddress.toLowerCase() === pool)
    }

    // Apply limit after filtering
    swaps = swaps.slice(0, limit)

    // Enrich with token metadata
    const enrichedSwaps = swaps.map(enrichSwap)

    return NextResponse.json({
      count: enrichedSwaps.length,
      swaps: enrichedSwaps,
      filters: {
        token: token || null,
        pool: pool || null,
        limit,
      },
    })
  } catch (error) {
    console.error('[Swaps API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch swaps' },
      { status: 500 }
    )
  }
}
