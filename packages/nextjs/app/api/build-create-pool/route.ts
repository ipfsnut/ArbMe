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
  ARBME,
} from '@arbme/core-lib'
import { parseUnits } from 'viem'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// Known token decimals to avoid RPC calls for common tokens
const KNOWN_DECIMALS: Record<string, number> = {
  [ARBME.address.toLowerCase()]: 18, // ARBME
  '0x4200000000000000000000000000000000000006': 18, // WETH
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,  // USDC
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': 8,  // cbBTC
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI
}

// Fetch cached prices from our own /api/pools endpoint
async function getCachedPrices(baseUrl: string): Promise<{ arbmePrice: number; tokenPrices: Record<string, number> } | null> {
  try {
    const response = await fetch(`${baseUrl}/api/pools`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok) {
      console.error('[build-create-pool] Failed to fetch cached prices:', response.status)
      return null
    }
    const data = await response.json()
    return {
      arbmePrice: parseFloat(data.arbmePrice) || 0,
      tokenPrices: data.tokenPrices || {},
    }
  } catch (error) {
    console.error('[build-create-pool] Error fetching cached prices:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // Set Alchemy key for RPC calls
    setAlchemyKey(ALCHEMY_KEY)

    // Get base URL from request for internal API calls
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host') || 'localhost:3000'
    const baseUrl = `${protocol}://${host}`

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
      initOnly,  // V4: only return init tx
      mintOnly,  // V4: only return mint tx (assumes pool exists)
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

    // Use known decimals first, fall back to RPC only if needed
    const token0Lower = token0.toLowerCase()
    const token1Lower = token1.toLowerCase()

    let token0Decimals = KNOWN_DECIMALS[token0Lower]
    let token1Decimals = KNOWN_DECIMALS[token1Lower]

    // Only fetch from RPC if we don't have known decimals
    if (token0Decimals === undefined || token1Decimals === undefined) {
      const [token0Metadata, token1Metadata] = await Promise.all([
        token0Decimals === undefined ? getTokenMetadata(token0, ALCHEMY_KEY) : Promise.resolve({ decimals: token0Decimals }),
        token1Decimals === undefined ? getTokenMetadata(token1, ALCHEMY_KEY) : Promise.resolve({ decimals: token1Decimals }),
      ])
      token0Decimals = token0Decimals ?? token0Metadata.decimals
      token1Decimals = token1Decimals ?? token1Metadata.decimals
    }

    // Convert decimal amounts to wei strings
    const amount0Wei = parseUnits(String(amount0), token0Decimals).toString()
    const amount1Wei = parseUnits(String(amount1), token1Decimals).toString()

    // Fetch cached prices from our pools endpoint for V3/V4 price calculation
    const cachedPrices = await getCachedPrices(baseUrl)

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

      // Try to get prices from cache first
      let token0UsdPrice: number | null = null
      let token1UsdPrice: number | null = null

      if (cachedPrices) {
        // Check if either token is ARBME
        const arbmeAddr = ARBME.address.toLowerCase()
        if (token0Lower === arbmeAddr) {
          token0UsdPrice = cachedPrices.arbmePrice
        } else if (cachedPrices.tokenPrices[token0Lower]) {
          token0UsdPrice = cachedPrices.tokenPrices[token0Lower]
        }

        if (token1Lower === arbmeAddr) {
          token1UsdPrice = cachedPrices.arbmePrice
        } else if (cachedPrices.tokenPrices[token1Lower]) {
          token1UsdPrice = cachedPrices.tokenPrices[token1Lower]
        }
      }

      // Calculate sqrtPriceX96 from price, adjusted for decimals
      // sqrtPriceX96 expects: token1_raw / token0_raw (where token0 < token1 lexicographically)
      let adjustedPrice: number

      // Use cached USD prices if available, otherwise fall back to provided price or amounts
      if (token0UsdPrice && token1UsdPrice) {
        const priceRatio = token0UsdPrice / token1UsdPrice
        if (isSwapped) {
          adjustedPrice = Math.pow(10, token0Decimals - token1Decimals) / priceRatio
        } else {
          adjustedPrice = Math.pow(10, token1Decimals - token0Decimals) * priceRatio
        }
        console.log('[build-create-pool] V3 using cached prices:', { token0UsdPrice, token1UsdPrice, priceRatio })
      } else if (price) {
        if (isSwapped) {
          adjustedPrice = Math.pow(10, token0Decimals - token1Decimals) / Number(price)
        } else {
          adjustedPrice = Math.pow(10, token1Decimals - token0Decimals) * Number(price)
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
      const isSwappedV4 = sortedToken0.toLowerCase() !== token0.toLowerCase()

      // Try to get prices from cache first (reuse variables from V3 scope or recalculate)
      let token0UsdPriceV4: number | null = null
      let token1UsdPriceV4: number | null = null

      if (cachedPrices) {
        const arbmeAddr = ARBME.address.toLowerCase()
        if (token0Lower === arbmeAddr) {
          token0UsdPriceV4 = cachedPrices.arbmePrice
        } else if (cachedPrices.tokenPrices[token0Lower]) {
          token0UsdPriceV4 = cachedPrices.tokenPrices[token0Lower]
        }

        if (token1Lower === arbmeAddr) {
          token1UsdPriceV4 = cachedPrices.arbmePrice
        } else if (cachedPrices.tokenPrices[token1Lower]) {
          token1UsdPriceV4 = cachedPrices.tokenPrices[token1Lower]
        }
      }

      // Calculate sqrtPriceX96 from price, adjusted for decimals
      let adjustedPriceV4: number

      // Use cached USD prices if available, otherwise fall back to provided price or amounts
      if (token0UsdPriceV4 && token1UsdPriceV4) {
        const priceRatioV4 = token0UsdPriceV4 / token1UsdPriceV4
        if (isSwappedV4) {
          adjustedPriceV4 = Math.pow(10, token0Decimals - token1Decimals) / priceRatioV4
        } else {
          adjustedPriceV4 = Math.pow(10, token1Decimals - token0Decimals) * priceRatioV4
        }
        console.log('[build-create-pool] V4 using cached prices:', { token0UsdPriceV4, token1UsdPriceV4, priceRatioV4 })
      } else if (price) {
        if (isSwappedV4) {
          adjustedPriceV4 = Math.pow(10, token0Decimals - token1Decimals) / Number(price)
        } else {
          adjustedPriceV4 = Math.pow(10, token1Decimals - token0Decimals) * Number(price)
        }
      } else {
        // Fallback: calculate from amounts (already in human-readable form)
        const priceFromAmounts = Number(amount1) / Number(amount0)
        if (isSwappedV4) {
          adjustedPriceV4 = Math.pow(10, token0Decimals - token1Decimals) / priceFromAmounts
        } else {
          adjustedPriceV4 = Math.pow(10, token1Decimals - token0Decimals) * priceFromAmounts
        }
      }

      console.log('[build-create-pool] V4 price calculation:', {
        originalPrice: price,
        isSwapped: isSwappedV4,
        token0Decimals,
        token1Decimals,
        adjustedPrice: adjustedPriceV4,
      })

      // Check if pool exists first
      const poolCheck = await checkV4PoolExists(sortedToken0, sortedToken1, fee, tickSpacing)

      // Use pool's existing price if it exists, otherwise calculate new price
      let sqrtPriceX96: bigint
      if (poolCheck.exists && poolCheck.sqrtPriceX96) {
        sqrtPriceX96 = BigInt(poolCheck.sqrtPriceX96)
        console.log('[build-create-pool] V4 using existing pool price:', {
          sortedToken0,
          sortedToken1,
          fee,
          tickSpacing,
          poolSqrtPriceX96: poolCheck.sqrtPriceX96,
          poolTick: poolCheck.tick,
        })
      } else {
        sqrtPriceX96 = calculateSqrtPriceX96(adjustedPriceV4)

        console.log('[build-create-pool] V4 creating new pool with price:', {
          sortedToken0,
          sortedToken1,
          fee,
          tickSpacing,
          newSqrtPriceX96: sqrtPriceX96.toString(),
        })

        // Validate sqrtPriceX96 is within bounds (only for new pools)
        const MIN_SQRT_PRICE = 4295128739n
        const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n
        if (sqrtPriceX96 < MIN_SQRT_PRICE || sqrtPriceX96 > MAX_SQRT_PRICE) {
          console.error('[build-create-pool] sqrtPriceX96 OUT OF BOUNDS:', sqrtPriceX96.toString())
          return NextResponse.json(
            { error: `Price calculation resulted in invalid sqrtPriceX96. Try adjusting the price ratio. (${sqrtPriceX96 < MIN_SQRT_PRICE ? 'too low' : 'too high'})` },
            { status: 400 }
          )
        }
      }

      // Adjust amounts based on token order
      const sortedAmount0V4 = isSwappedV4 ? amount1Wei : amount0Wei
      const sortedAmount1V4 = isSwappedV4 ? amount0Wei : amount1Wei

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

      // Handle initOnly flag - return only the init tx
      if (initOnly) {
        if (poolCheck.exists) {
          // Pool already exists, no init needed
          return NextResponse.json({
            success: true,
            version: 'V4',
            poolExists: true,
            transactions: [],
            message: 'Pool already exists, no initialization needed',
          })
        }

        const initTx = buildV4InitializePoolTransaction(params)

        // Simulate to catch errors early
        try {
          const rpcUrl = ALCHEMY_KEY
            ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
            : 'https://mainnet.base.org'

          const simResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_call',
              params: [{ to: initTx.to, data: initTx.data }, 'latest']
            })
          })
          const simResult = await simResponse.json()

          if (simResult.error) {
            const errMsg = simResult.error.message || simResult.error.data || ''
            if (errMsg.includes('PoolAlreadyInitialized') || errMsg.includes('0x7983c051') || errMsg.includes('0x83b25734')) {
              return NextResponse.json({
                success: true,
                version: 'V4',
                poolExists: true,
                transactions: [],
                message: 'Pool already initialized',
              })
            }
          }
        } catch (simErr) {
          console.warn('[build-create-pool] Could not simulate initialize:', simErr)
        }

        return NextResponse.json({
          success: true,
          version: 'V4',
          poolExists: false,
          transactions: [{
            to: initTx.to,
            data: initTx.data,
            value: initTx.value,
            description: 'Initialize V4 pool with initial price',
          }],
        })
      }

      // Handle mintOnly flag - return only the mint tx (assumes pool exists)
      if (mintOnly) {
        // Re-check pool exists and get current price
        const freshPoolCheck = await checkV4PoolExists(sortedToken0, sortedToken1, fee, tickSpacing)
        if (!freshPoolCheck.exists) {
          return NextResponse.json(
            { error: 'Pool does not exist. Initialize it first.' },
            { status: 400 }
          )
        }

        // Use pool's actual sqrtPriceX96 for the mint
        const poolSqrtPriceX96 = BigInt(freshPoolCheck.sqrtPriceX96 || '0')
        const mintParams = {
          ...params,
          sqrtPriceX96: poolSqrtPriceX96,
        }

        const mintTx = buildV4MintPositionTransaction(mintParams)
        return NextResponse.json({
          success: true,
          version: 'V4',
          poolExists: true,
          transactions: [{
            to: mintTx.to,
            data: mintTx.data,
            value: mintTx.value,
            description: 'Mint V4 LP position',
          }],
        })
      }

      // Standard flow: return both init (if needed) and mint
      if (!poolCheck.exists) {
        const initTx = buildV4InitializePoolTransaction(params)

        // Try to simulate the initialize
        try {
          const rpcUrl = ALCHEMY_KEY
            ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
            : 'https://mainnet.base.org'

          const simResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_call',
              params: [{ to: initTx.to, data: initTx.data }, 'latest']
            })
          })
          const simResult = await simResponse.json()

          if (simResult.error) {
            const errMsg = simResult.error.message || simResult.error.data || ''
            if (errMsg.includes('PoolAlreadyInitialized') || errMsg.includes('0x7983c051') || errMsg.includes('0x83b25734')) {
              // Pool exists, skip init
            } else {
              const recheckPool = await checkV4PoolExists(sortedToken0, sortedToken1, fee, tickSpacing)
              if (!recheckPool.exists) {
                return NextResponse.json(
                  { error: `Initialize simulation failed: ${errMsg}` },
                  { status: 400 }
                )
              }
            }
          } else {
            // Init would succeed, add it
            transactions.push({
              to: initTx.to,
              data: initTx.data,
              value: initTx.value,
              description: 'Initialize V4 pool with initial price',
            })
          }
        } catch (simErr) {
          // Can't simulate, add init tx anyway
          transactions.push({
            to: initTx.to,
            data: initTx.data,
            value: initTx.value,
            description: 'Initialize V4 pool with initial price',
          })
        }
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
