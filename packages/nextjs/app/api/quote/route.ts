import { NextRequest, NextResponse } from 'next/server'
import { getSwapQuote } from '@arbme/core-lib'
import { ethers } from 'ethers'

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

export async function POST(request: NextRequest) {
  try {
    const { poolAddress, version, tokenIn, tokenOut, amountIn, fee, tickSpacing } = await request.json()

    if (!poolAddress || !version || !tokenIn || !tokenOut || !amountIn) {
      return NextResponse.json(
        { error: 'Missing required parameters: poolAddress, version, tokenIn, tokenOut, amountIn' },
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
    const decimals0 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? decimalsIn : decimalsOut
    const decimals1 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? decimalsOut : decimalsIn

    let quoteParams: any = {
      poolAddress,
      version: version.toUpperCase(),
      tokenIn,
      tokenOut,
      amountIn,
      fee: fee || 3000,
      tickSpacing: tickSpacing || 60,
      decimals0,
      decimals1,
    }

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
      // For V4, we need to compute the poolId and fetch from StateView
      // PoolId = keccak256(PoolKey)
      // For now, use a simplified approach - fetch from pool address if it's actually a V3-style pool
      // Or compute poolId from the poolKey parameters

      // V4 pools don't have a direct pool contract address like V3
      // The poolAddress for V4 is actually the poolId (bytes32)
      // Let's try to get slot0 from StateView
      try {
        const stateView = new ethers.Contract(STATE_VIEW, STATE_VIEW_ABI, provider)
        // If poolAddress is a poolId (bytes32), use it directly
        // Otherwise, we need to compute it
        const poolId = poolAddress.startsWith('0x') && poolAddress.length === 66
          ? poolAddress
          : ethers.utils.keccak256(
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'address', 'uint24', 'int24', 'address'],
                [token0, tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenOut : tokenIn, fee || 3000, tickSpacing || 60, ethers.constants.AddressZero]
              )
            )

        const slot0 = await stateView.getSlot0(poolId)
        quoteParams.sqrtPriceX96 = slot0.sqrtPriceX96.toString()
      } catch (v4Error) {
        // Fallback: try treating it as a V3-style pool
        console.error('[quote] V4 StateView error, falling back to V3 method:', v4Error)
        const pool = new ethers.Contract(poolAddress, V3_POOL_ABI, provider)
        const slot0 = await pool.slot0()
        quoteParams.sqrtPriceX96 = slot0.sqrtPriceX96.toString()
      }
    }

    const quote = getSwapQuote(quoteParams)

    return NextResponse.json({
      success: true,
      amountOut: quote.amountOut,
      priceImpact: quote.priceImpact,
      executionPrice: quote.executionPrice,
    })
  } catch (error: any) {
    console.error('[quote] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get swap quote' },
      { status: 500 }
    )
  }
}
