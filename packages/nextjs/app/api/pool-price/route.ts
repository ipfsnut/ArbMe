import { NextRequest, NextResponse } from 'next/server'
import {
  sortTokens,
  checkV2PoolExists,
  checkV3PoolExists,
  checkV4PoolExists,
  getTokenDecimals,
  getTokenSymbol,
  setAlchemyKey,
  FEE_TO_TICK_SPACING,
  ARBME,
} from '@arbme/core-lib'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// Known token decimals to avoid RPC calls
const KNOWN_DECIMALS: Record<string, number> = {
  [ARBME.address.toLowerCase()]: 18,
  '0x4200000000000000000000000000000000000006': 18, // WETH
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,  // USDC
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': 8,  // cbBTC
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI
}

async function getDecimals(token: string): Promise<number> {
  const known = KNOWN_DECIMALS[token.toLowerCase()]
  if (known !== undefined) return known
  return getTokenDecimals(token as `0x${string}`)
}

export async function POST(request: NextRequest) {
  try {
    setAlchemyKey(ALCHEMY_KEY)

    const { version, token0, token1, fee } = await request.json()

    if (!version || !token0 || !token1) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // token0 and token1 are in the USER's order (how they selected them in the UI).
    // We need to sort them for on-chain lookups, then return the price in user order.
    const [sortedToken0, sortedToken1] = sortTokens(token0, token1)
    const isSwapped = sortedToken0.toLowerCase() !== token0.toLowerCase()

    // Fetch decimals and symbols in parallel
    const [decimals0, decimals1, symbol0, symbol1] = await Promise.all([
      getDecimals(token0),
      getDecimals(token1),
      getTokenSymbol(token0 as `0x${string}`).catch(() => token0.slice(0, 6)),
      getTokenSymbol(token1 as `0x${string}`).catch(() => token1.slice(0, 6)),
    ])

    if (version === 'v2') {
      const result = await checkV2PoolExists(token0, token1)

      if (!result.exists || !result.pair) {
        return NextResponse.json({
          exists: false,
          price: null,
          priceDisplay: null,
          token0Symbol: symbol0,
          token1Symbol: symbol1,
        })
      }

      // Fetch reserves via raw RPC
      const rpcUrl = ALCHEMY_KEY
        ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
        : 'https://mainnet.base.org'

      const reservesRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{ to: result.pair, data: '0x0902f1ac' /* getReserves() */ }, 'latest'],
        }),
      })
      const reservesData = await reservesRes.json()
      if (reservesData.error) throw new Error(reservesData.error.message)

      const hex = reservesData.result.slice(2)
      const reserve0Raw = BigInt('0x' + hex.slice(0, 64))
      const reserve1Raw = BigInt('0x' + hex.slice(64, 128))

      // V2 pair.token0() is always the lower address
      // Get decimals in sorted order
      const sortedDecimals0 = isSwapped ? decimals1 : decimals0
      const sortedDecimals1 = isSwapped ? decimals0 : decimals1

      // Convert reserves to human-readable using correct decimals
      const reserve0Human = Number(reserve0Raw) / Math.pow(10, sortedDecimals0)
      const reserve1Human = Number(reserve1Raw) / Math.pow(10, sortedDecimals1)

      // Price in sorted order: how much sorted_token1 per sorted_token0
      const sortedPrice = reserve1Human / reserve0Human

      // Convert to user order
      const price = isSwapped ? (1 / sortedPrice) : sortedPrice

      const priceDisplay = `1 ${symbol0} = ${formatPrice(price)} ${symbol1}`

      return NextResponse.json({
        exists: true,
        price,
        priceDisplay,
        token0Symbol: symbol0,
        token1Symbol: symbol1,
      })
    }

    if (version === 'v3') {
      const poolCheck = await checkV3PoolExists(sortedToken0, sortedToken1, fee)

      if (!poolCheck.exists || !poolCheck.pool) {
        return NextResponse.json({
          exists: false,
          price: null,
          priceDisplay: null,
          token0Symbol: symbol0,
          token1Symbol: symbol1,
        })
      }

      // Fetch slot0 via raw RPC
      const rpcUrl = ALCHEMY_KEY
        ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
        : 'https://mainnet.base.org'

      const slot0Res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{ to: poolCheck.pool, data: '0x3850c7bd' /* slot0() */ }, 'latest'],
        }),
      })
      const slot0Data = await slot0Res.json()
      if (slot0Data.error) throw new Error(slot0Data.error.message)

      const sqrtPriceX96 = BigInt('0x' + slot0Data.result.slice(2, 66))
      const price = sqrtPriceToUserPrice(sqrtPriceX96, decimals0, decimals1, isSwapped)

      const priceDisplay = `1 ${symbol0} = ${formatPrice(price)} ${symbol1}`

      return NextResponse.json({
        exists: true,
        sqrtPriceX96: sqrtPriceX96.toString(),
        price,
        priceDisplay,
        token0Symbol: symbol0,
        token1Symbol: symbol1,
      })
    }

    if (version === 'v4') {
      const tickSpacing = FEE_TO_TICK_SPACING[fee]
      if (!tickSpacing) {
        return NextResponse.json(
          { error: `Invalid fee tier for V4: ${fee}` },
          { status: 400 }
        )
      }

      // Use StateView to get V4 pool slot0 (same as checkV4PoolExists)
      const poolCheck = await checkV4PoolExists(sortedToken0, sortedToken1, fee, tickSpacing)

      if (!poolCheck.exists || !poolCheck.sqrtPriceX96) {
        return NextResponse.json({
          exists: false,
          price: null,
          priceDisplay: null,
          token0Symbol: symbol0,
          token1Symbol: symbol1,
        })
      }

      const sqrtPriceX96 = BigInt(poolCheck.sqrtPriceX96)
      const price = sqrtPriceToUserPrice(sqrtPriceX96, decimals0, decimals1, isSwapped)

      const priceDisplay = `1 ${symbol0} = ${formatPrice(price)} ${symbol1}`

      return NextResponse.json({
        exists: true,
        sqrtPriceX96: poolCheck.sqrtPriceX96,
        price,
        priceDisplay,
        token0Symbol: symbol0,
        token1Symbol: symbol1,
      })
    }

    return NextResponse.json(
      { error: `Unsupported version: ${version}` },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[pool-price] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pool price' },
      { status: 500 }
    )
  }
}

/**
 * Convert sqrtPriceX96 to a human-readable price in the USER's token order.
 *
 * sqrtPriceX96 is always in sorted order: sqrt(sorted_token1_raw / sorted_token0_raw) * 2^96
 *
 * To get human-readable price (token1_human / token0_human in user order):
 * 1. rawPrice = (sqrtPriceX96 / 2^96)^2 = sorted_token1_raw / sorted_token0_raw
 * 2. Adjust for decimals: humanPrice = rawPrice * 10^(sorted_decimals0 - sorted_decimals1)
 * 3. If user order is swapped from sorted order, invert the price
 */
function sqrtPriceToUserPrice(
  sqrtPriceX96: bigint,
  userDecimals0: number,
  userDecimals1: number,
  isSwapped: boolean,
): number {
  const Q96 = 2n ** 96n
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
  const rawPrice = sqrtPrice ** 2 // sorted_token1_raw / sorted_token0_raw

  // Decimals in sorted order
  const sortedDecimals0 = isSwapped ? userDecimals1 : userDecimals0
  const sortedDecimals1 = isSwapped ? userDecimals0 : userDecimals1

  // Adjust for decimals: human price in sorted order
  const sortedHumanPrice = rawPrice * Math.pow(10, sortedDecimals0 - sortedDecimals1)

  // Return in user's token order
  return isSwapped ? (1 / sortedHumanPrice) : sortedHumanPrice
}

/**
 * Format price for display — avoids scientific notation
 */
function formatPrice(price: number): string {
  if (price === 0) return '0'
  if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })

  // For small numbers, show enough significant digits
  const str = price.toFixed(20)
  const match = str.match(/^0\.(0*)([1-9]\d{0,7})/)
  if (match) {
    const zeros = match[1].length
    return price.toFixed(zeros + Math.min(match[2].length, 6))
  }
  return price.toFixed(10)
}
