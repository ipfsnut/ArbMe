import { NextRequest, NextResponse } from 'next/server'
import { getSwapQuote, CLANKER_HOOK_V2, CLANKER_HOOK_V1, CLANKER_DYNAMIC_FEE, CLANKER_TICK_SPACING } from '@arbme/core-lib'
import { ethers } from 'ethers'

export const maxDuration = 60

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY
const PROVIDER_URL = ALCHEMY_KEY
  ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
  : 'https://mainnet.base.org'

// V2 Pair ABI
const V2_PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]

// V3 Pool ABI
const V3_POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]

// ERC20 ABI for decimals
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
]

// V4 StateView address (Base mainnet - verified 2026-02-01)
const STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71'

// V4 StateView ABI (minimal)
const STATE_VIEW_ABI = [
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
]

const NO_HOOK = ethers.constants.AddressZero

// Pool config for auto-detection
interface PoolCandidate {
  fee: number
  tickSpacing: number
  hooks: string
  name: string
}

function getTickSpacing(fee: number): number {
  const spacings: Record<number, number> = {
    100: 1, 500: 10, 3000: 60, 10000: 200, 50000: 1000, 8388608: 200,
  }
  return spacings[fee] || 60
}

function getV4PoolCandidates(fee?: number, tickSpacing?: number, hooks?: string): PoolCandidate[] {
  const candidates: PoolCandidate[] = []

  // If caller provides explicit hooks, try that first
  if (hooks) {
    candidates.push({
      fee: fee || CLANKER_DYNAMIC_FEE,
      tickSpacing: tickSpacing || CLANKER_TICK_SPACING,
      hooks,
      name: 'explicit',
    })
  }

  // Clanker V2 hooked pool (most common for newer tokens)
  candidates.push({
    fee: CLANKER_DYNAMIC_FEE,
    tickSpacing: CLANKER_TICK_SPACING,
    hooks: CLANKER_HOOK_V2,
    name: 'clanker-v2',
  })

  // Clanker V1 hooked pool (older tokens)
  candidates.push({
    fee: CLANKER_DYNAMIC_FEE,
    tickSpacing: CLANKER_TICK_SPACING,
    hooks: CLANKER_HOOK_V1,
    name: 'clanker-v1',
  })

  // Standard hookless pools
  const standardFees = fee ? [fee] : [3000, 10000, 500, 50000]
  for (const f of standardFees) {
    candidates.push({
      fee: f,
      tickSpacing: tickSpacing || getTickSpacing(f),
      hooks: NO_HOOK,
      name: `v4-${f / 10000}%`,
    })
  }

  return candidates
}

export async function POST(request: NextRequest) {
  try {
    const { poolAddress, version, tokenIn, tokenOut, amountIn, fee, tickSpacing, hooks } = await request.json()

    if (!version || !tokenIn || !tokenOut || !amountIn) {
      return NextResponse.json(
        { error: 'Missing required parameters: version, tokenIn, tokenOut, amountIn' },
        { status: 400 }
      )
    }

    // poolAddress is required for V2/V3 but optional for V4 (auto-detected)
    if (!poolAddress && version.toUpperCase() !== 'V4') {
      return NextResponse.json(
        { error: 'poolAddress is required for V2 and V3 quotes' },
        { status: 400 }
      )
    }

    const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL)

    // Get token decimals
    const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, provider)
    const tokenOutContract = new ethers.Contract(tokenOut, ERC20_ABI, provider)

    const [decimalsIn, decimalsOut] = await Promise.all([
      tokenInContract.decimals(),
      tokenOutContract.decimals(),
    ])

    // Determine which token is token0 (lower address)
    const token0 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenIn : tokenOut
    const token1 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenOut : tokenIn
    const decimals0 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? decimalsIn : decimalsOut
    const decimals1 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? decimalsOut : decimalsIn

    let quoteParams: any = {
      poolAddress: poolAddress || '',
      version: version.toUpperCase(),
      tokenIn,
      tokenOut,
      amountIn,
      fee: fee || 3000,
      tickSpacing: tickSpacing || 60,
      decimals0,
      decimals1,
    }

    let detectedHooks: string | undefined

    if (version.toUpperCase() === 'V2') {
      // Fetch V2 reserves
      const pair = new ethers.Contract(poolAddress, V2_PAIR_ABI, provider)
      const [reserves, pairToken0] = await Promise.all([
        pair.getReserves(),
        pair.token0(),
      ])

      // Ensure reserves are in correct order
      const isToken0First = pairToken0.toLowerCase() === token0.toLowerCase()
      quoteParams.reserve0 = isToken0First ? reserves.reserve0.toString() : reserves.reserve1.toString()
      quoteParams.reserve1 = isToken0First ? reserves.reserve1.toString() : reserves.reserve0.toString()

    } else if (version.toUpperCase() === 'V3') {
      // Fetch V3 slot0
      const pool = new ethers.Contract(poolAddress, V3_POOL_ABI, provider)
      const slot0 = await pool.slot0()
      quoteParams.sqrtPriceX96 = slot0.sqrtPriceX96.toString()

    } else if (version.toUpperCase() === 'V4') {
      const stateView = new ethers.Contract(STATE_VIEW, STATE_VIEW_ABI, provider)

      // If poolAddress is already a poolId (bytes32), use it directly with provided params
      if (poolAddress && poolAddress.length === 66) {
        try {
          const slot0 = await stateView.getSlot0(poolAddress)
          quoteParams.sqrtPriceX96 = slot0.sqrtPriceX96.toString()
          detectedHooks = hooks || NO_HOOK
        } catch (e) {
          console.error('[quote] V4 direct poolId lookup failed:', e)
        }
      }

      // Auto-detect: try multiple pool configurations
      if (!quoteParams.sqrtPriceX96) {
        const candidates = getV4PoolCandidates(fee, tickSpacing, hooks)

        for (const candidate of candidates) {
          try {
            const poolId = ethers.utils.keccak256(
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'address', 'uint24', 'int24', 'address'],
                [token0, token1, candidate.fee, candidate.tickSpacing, candidate.hooks]
              )
            )

            const slot0 = await stateView.getSlot0(poolId)
            // Check if pool actually exists (sqrtPriceX96 > 0)
            if (slot0.sqrtPriceX96.gt(0)) {
              quoteParams.sqrtPriceX96 = slot0.sqrtPriceX96.toString()
              quoteParams.fee = candidate.fee
              quoteParams.tickSpacing = candidate.tickSpacing
              detectedHooks = candidate.hooks
              console.log(`[quote] V4 pool found via ${candidate.name}: hooks=${candidate.hooks}`)
              break
            }
          } catch {
            // Pool doesn't exist with this config, try next
          }
        }

        if (!quoteParams.sqrtPriceX96) {
          return NextResponse.json(
            { error: 'No V4 pool found for this token pair. Tried Clanker V2, V1, and standard hookless pools.' },
            { status: 404 }
          )
        }
      }
    }

    const quote = getSwapQuote(quoteParams)

    return NextResponse.json({
      success: true,
      amountOut: quote.amountOut,
      priceImpact: quote.priceImpact,
      executionPrice: quote.executionPrice,
      // For V4: return detected pool params so /api/swap can use them
      ...(detectedHooks !== undefined && {
        hooks: detectedHooks,
        fee: quoteParams.fee,
        tickSpacing: quoteParams.tickSpacing,
      }),
    })
  } catch (error: any) {
    console.error('[quote] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get swap quote' },
      { status: 500 }
    )
  }
}
