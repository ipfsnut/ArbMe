import { NextRequest, NextResponse } from 'next/server'
import {
  checkV2PoolExists,
  checkV3PoolExists,
  checkV4PoolExists,
  sortTokens,
  FEE_TO_TICK_SPACING,
  setAlchemyKey
} from '@arbme/core-lib'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

export async function POST(request: NextRequest) {
  try {
    // Set Alchemy key for RPC calls
    setAlchemyKey(ALCHEMY_KEY)

    const { version, token0, token1, fee } = await request.json()

    if (!version || !token0 || !token1) {
      return NextResponse.json(
        { error: 'Missing required parameters: version, token0, token1' },
        { status: 400 }
      )
    }

    // Validate addresses
    if (!/^0x[a-fA-F0-9]{40}$/.test(token0) || !/^0x[a-fA-F0-9]{40}$/.test(token1)) {
      return NextResponse.json(
        { error: 'Invalid token address format' },
        { status: 400 }
      )
    }

    const versionLower = version.toLowerCase()

    if (versionLower === 'v2') {
      const result = await checkV2PoolExists(token0, token1)
      return NextResponse.json({
        version: 'V2',
        exists: result.exists,
        poolAddress: result.pair || null,
      })
    }

    if (versionLower === 'v3') {
      if (!fee) {
        return NextResponse.json(
          { error: 'Missing required parameter: fee (for V3)' },
          { status: 400 }
        )
      }

      // Sort tokens for V3
      const [sortedToken0, sortedToken1] = sortTokens(token0, token1)
      const result = await checkV3PoolExists(sortedToken0, sortedToken1, fee)

      return NextResponse.json({
        version: 'V3',
        exists: result.exists,
        poolAddress: result.pool || null,
        fee,
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

      // Sort tokens for V4
      const [sortedToken0, sortedToken1] = sortTokens(token0, token1)
      const result = await checkV4PoolExists(sortedToken0, sortedToken1, fee, tickSpacing)

      return NextResponse.json({
        version: 'V4',
        exists: result.exists,
        initialized: result.initialized,
        fee,
        tickSpacing,
      })
    }

    return NextResponse.json(
      { error: `Unsupported version: ${version}` },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[check-pool-exists] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check pool' },
      { status: 500 }
    )
  }
}
