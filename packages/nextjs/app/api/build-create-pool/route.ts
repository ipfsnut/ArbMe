import { NextRequest, NextResponse } from 'next/server'
import {
  buildV2CreatePoolTransaction,
  buildV3InitializePoolTransaction,
  buildV3MintPositionTransaction,
  buildV4InitializePoolTransaction,
  buildV4MintPositionTransaction,
  sortTokens,
  calculateSqrtPriceX96,
  checkV3PoolExists,
  checkV4PoolExists,
  FEE_TO_TICK_SPACING,
  setAlchemyKey,
  getTokenMetadata,
  fetchPools,
  ARBME,
} from '@arbme/core-lib'
import { parseUnits } from 'viem'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// Known token decimals to avoid RPC calls
const KNOWN_DECIMALS: Record<string, number> = {
  '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07': 18, // ARBME
  '0x4200000000000000000000000000000000000006': 18, // WETH
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,  // USDC
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': 8,  // cbBTC
}

/**
 * Get token price from our cached pools data
 */
async function getTokenPriceFromCache(tokenAddress: string): Promise<number | null> {
  try {
    const poolsData = await fetchPools(ALCHEMY_KEY)
    const addr = tokenAddress.toLowerCase()

    // Check if it's ARBME
    if (addr === ARBME.address.toLowerCase()) {
      return parseFloat(poolsData.arbmePrice) || null
    }

    // Check tokenPrices map
    if (poolsData.tokenPrices[addr]) {
      return poolsData.tokenPrices[addr]
    }

    return null
  } catch (error) {
    console.error('[build-create-pool] Error fetching cached prices:', error)
    return null
  }
}

/**
 * Get token decimals - use known values or fetch via RPC
 */
async function getTokenDecimals(tokenAddress: string): Promise<number> {
  const addr = tokenAddress.toLowerCase()

  // Use known decimals if available
  if (KNOWN_DECIMALS[addr] !== undefined) {
    return KNOWN_DECIMALS[addr]
  }

  // Fall back to RPC call
  const metadata = await getTokenMetadata(tokenAddress, ALCHEMY_KEY)
  return metadata.decimals
}

export async function POST(request: NextRequest) {
  try {
    // Set Alchemy key for RPC calls
    setAlchemyKey(ALCHEMY_KEY)

    const {
      version,
      token0,
      token1,
      amount0,
      amount1,
      fee,
      price,
      recipient,
      slippageTolerance,
    } = await request.json()

    if (!version || !token0 || !token1 || !amount0 || !amount1 || !recipient) {
      return NextResponse.json(
        { error: 'Missing required parameters: version, token0, token1, amount0, amount1, recipient' },
        { status: 400 }
      )
    }

    // Validate addresses
    const addresses = [token0, token1, recipient]
    for (const addr of addresses) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return NextResponse.json(
          { error: `Invalid address format: ${addr}` },
          { status: 400 }
        )
      }
    }

    const versionLower = version.toLowerCase()
    const transactions: Array<{ to: string; data: string; value: string; description: string }> = []

    // Get token decimals (use known values when possible to avoid RPC calls)
    const [token0Decimals, token1Decimals] = await Promise.all([
      getTokenDecimals(token0),
      getTokenDecimals(token1),
    ])

    // Convert decimal amounts to wei strings
    const amount0Wei = parseUnits(String(amount0), token0Decimals).toString()
    const amount1Wei = parseUnits(String(amount1), token1Decimals).toString()

    // Get prices from our cached pools data (much faster than RPC calls)
    let token0UsdPrice: number | null = null
    let token1UsdPrice: number | null = null

    if (!price) {
      // Fetch prices from our cache
      const [price0, price1] = await Promise.all([
        getTokenPriceFromCache(token0),
        getTokenPriceFromCache(token1),
      ])
      token0UsdPrice = price0
      token1UsdPrice = price1
      console.log('[build-create-pool] Cached prices:', { token0UsdPrice, token1UsdPrice })
    }

    if (versionLower === 'v2') {
      // V2: Single transaction to add liquidity (creates pool if doesn't exist)
      const tx = buildV2CreatePoolTransaction({
        tokenA: token0,
        tokenB: token1,
        amountA: amount0Wei,
        amountB: amount1Wei,
        recipient,
        slippageTolerance: slippageTolerance || 0.5,
      })

      transactions.push({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        description: 'Add liquidity to V2 pool (creates pool if needed)',
      })

      return NextResponse.json({
        success: true,
        version: 'V2',
        transactions,
      })
    }

    if (versionLower === 'v3') {
      if (!fee) {
        return NextResponse.json(
          { error: 'Missing required parameter: fee (for V3)' },
          { status: 400 }
        )
      }

      // Sort tokens
      const [sortedToken0, sortedToken1] = sortTokens(token0, token1)
      const isSwapped = sortedToken0.toLowerCase() !== token0.toLowerCase()

      // Calculate sqrtPriceX96 from price, adjusted for decimals
      // sqrtPriceX96 expects: token1_raw / token0_raw (where token0 < token1 lexicographically)
      let adjustedPrice: number
      if (price) {
        // Frontend provided price directly
        if (isSwapped) {
          adjustedPrice = Math.pow(10, token0Decimals - token1Decimals) / Number(price)
        } else {
          adjustedPrice = Math.pow(10, token1Decimals - token0Decimals) * Number(price)
        }
      } else if (token0UsdPrice && token1UsdPrice) {
        // Use cached prices from our pools endpoint
        const priceRatio = token0UsdPrice / token1UsdPrice
        if (isSwapped) {
          adjustedPrice = Math.pow(10, token0Decimals - token1Decimals) / priceRatio
        } else {
          adjustedPrice = Math.pow(10, token1Decimals - token0Decimals) * priceRatio
        }
      } else {
        // Fallback: calculate from amounts (already in human-readable form)
        const priceFromAmounts = Number(amount1) / Number(amount0)
        if (isSwapped) {
          adjustedPrice = Math.pow(10, token0Decimals - token1Decimals) / priceFromAmounts
        } else {
          adjustedPrice = Math.pow(10, token1Decimals - token0Decimals) * priceFromAmounts
        }
      }

      console.log('[build-create-pool] V3 price calculation:', {
        originalPrice: price,
        cachedPrices: { token0UsdPrice, token1UsdPrice },
        isSwapped,
        token0Decimals,
        token1Decimals,
        adjustedPrice,
      })

      const sqrtPriceX96 = calculateSqrtPriceX96(adjustedPrice)

      // Check if pool exists
      const poolCheck = await checkV3PoolExists(sortedToken0, sortedToken1, fee)

      // Adjust amounts based on token order (isSwapped already calculated above)
      const sortedAmount0 = isSwapped ? amount1Wei : amount0Wei
      const sortedAmount1 = isSwapped ? amount0Wei : amount1Wei

      const params = {
        token0: sortedToken0,
        token1: sortedToken1,
        fee,
        sqrtPriceX96,
        amount0: sortedAmount0,
        amount1: sortedAmount1,
        recipient,
        slippageTolerance: slippageTolerance || 0.5,
      }

      if (!poolCheck.exists) {
        // Pool doesn't exist - need to initialize first
        const initTx = buildV3InitializePoolTransaction(params)
        transactions.push({
          to: initTx.to,
          data: initTx.data,
          value: initTx.value,
          description: 'Initialize V3 pool with initial price',
        })
      }

      // Mint position
      const mintTx = buildV3MintPositionTransaction(params)
      transactions.push({
        to: mintTx.to,
        data: mintTx.data,
        value: mintTx.value,
        description: 'Mint V3 LP position',
      })

      return NextResponse.json({
        success: true,
        version: 'V3',
        poolExists: poolCheck.exists,
        transactions,
      })
    }

    if (versionLower === 'v4') {
      if (!fee) {
        return NextResponse.json(
          { error: 'Missing required parameter: fee (for V4)' },
          { status: 400 }
        )
      }

      const tickSpacing = FEE_TO_TICK_SPACING[fee]
      if (!tickSpacing) {
        return NextResponse.json(
          { error: `Invalid fee tier for V4: ${fee}` },
          { status: 400 }
        )
      }

      // Sort tokens
      const [sortedToken0, sortedToken1] = sortTokens(token0, token1)
      const isSwapped = sortedToken0.toLowerCase() !== token0.toLowerCase()

      // Calculate sqrtPriceX96 from price, adjusted for decimals
      // sqrtPriceX96 expects: token1_raw / token0_raw (where token0 < token1 lexicographically)
      let adjustedPriceV4: number
      if (price) {
        // Frontend provided price directly
        if (isSwapped) {
          adjustedPriceV4 = Math.pow(10, token0Decimals - token1Decimals) / Number(price)
        } else {
          adjustedPriceV4 = Math.pow(10, token1Decimals - token0Decimals) * Number(price)
        }
      } else if (token0UsdPrice && token1UsdPrice) {
        // Use cached prices from our pools endpoint
        const priceRatio = token0UsdPrice / token1UsdPrice
        if (isSwapped) {
          adjustedPriceV4 = Math.pow(10, token0Decimals - token1Decimals) / priceRatio
        } else {
          adjustedPriceV4 = Math.pow(10, token1Decimals - token0Decimals) * priceRatio
        }
      } else {
        // Fallback: calculate from amounts (already in human-readable form)
        const priceFromAmounts = Number(amount1) / Number(amount0)
        if (isSwapped) {
          adjustedPriceV4 = Math.pow(10, token0Decimals - token1Decimals) / priceFromAmounts
        } else {
          adjustedPriceV4 = Math.pow(10, token1Decimals - token0Decimals) * priceFromAmounts
        }
      }

      console.log('[build-create-pool] V4 price calculation:', {
        originalPrice: price,
        cachedPrices: { token0UsdPrice, token1UsdPrice },
        isSwapped,
        token0Decimals,
        token1Decimals,
        adjustedPrice: adjustedPriceV4,
      })

      const sqrtPriceX96 = calculateSqrtPriceX96(adjustedPriceV4)

      // Check if pool exists
      const poolCheck = await checkV4PoolExists(sortedToken0, sortedToken1, fee, tickSpacing)

      // Adjust amounts based on token order
      const sortedAmount0V4 = isSwapped ? amount1Wei : amount0Wei
      const sortedAmount1V4 = isSwapped ? amount0Wei : amount1Wei

      const params = {
        token0: sortedToken0,
        token1: sortedToken1,
        fee,
        sqrtPriceX96,
        amount0: sortedAmount0V4,
        amount1: sortedAmount1V4,
        recipient,
        slippageTolerance: slippageTolerance || 0.5,
      }

      if (!poolCheck.exists) {
        // Pool doesn't exist - need to initialize first
        const initTx = buildV4InitializePoolTransaction(params)
        transactions.push({
          to: initTx.to,
          data: initTx.data,
          value: initTx.value,
          description: 'Initialize V4 pool with initial price',
        })
      }

      // Mint position
      const mintTx = buildV4MintPositionTransaction(params)
      transactions.push({
        to: mintTx.to,
        data: mintTx.data,
        value: mintTx.value,
        description: 'Mint V4 LP position',
      })

      return NextResponse.json({
        success: true,
        version: 'V4',
        poolExists: poolCheck.exists,
        transactions,
      })
    }

    return NextResponse.json(
      { error: `Unsupported version: ${version}` },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[build-create-pool] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build create pool transaction' },
      { status: 500 }
    )
  }
}
