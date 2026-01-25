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
} from '@arbme/core-lib'
import { parseUnits } from 'viem'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

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

    // Fetch token decimals and convert amounts to wei
    const [token0Metadata, token1Metadata] = await Promise.all([
      getTokenMetadata(token0, ALCHEMY_KEY),
      getTokenMetadata(token1, ALCHEMY_KEY),
    ])

    // Convert decimal amounts to wei strings
    const amount0Wei = parseUnits(String(amount0), token0Metadata.decimals).toString()
    const amount1Wei = parseUnits(String(amount1), token1Metadata.decimals).toString()

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

      // Calculate sqrtPriceX96 from price
      const sqrtPriceX96 = price
        ? calculateSqrtPriceX96(Number(price))
        : calculateSqrtPriceX96(Number(amount1) / Number(amount0))

      // Check if pool exists
      const poolCheck = await checkV3PoolExists(sortedToken0, sortedToken1, fee)

      // Adjust amounts based on token order
      const isSwapped = sortedToken0.toLowerCase() !== token0.toLowerCase()
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

      // Calculate sqrtPriceX96 from price
      const sqrtPriceX96 = price
        ? calculateSqrtPriceX96(Number(price))
        : calculateSqrtPriceX96(Number(amount1) / Number(amount0))

      // Check if pool exists
      const poolCheck = await checkV4PoolExists(sortedToken0, sortedToken1, fee, tickSpacing)

      // Adjust amounts based on token order
      const isSwapped = sortedToken0.toLowerCase() !== token0.toLowerCase()
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
