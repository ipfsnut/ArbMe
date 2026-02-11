import { NextRequest, NextResponse } from 'next/server'
import {
  checkV2PoolExists,
  checkV3PoolExists,
  checkV4PoolExists,
  sortTokens,
  FEE_TO_TICK_SPACING,
  setAlchemyKey,
  ARBME,
  V2_ARBME_POOLS,
  V4_ARBME_POOLS,
} from '@arbme/core-lib'

export const maxDuration = 60

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// Check if a pair involves ARBME
function isArbmePair(token0: string, token1: string): boolean {
  const arbmeAddr = ARBME.address.toLowerCase()
  return token0.toLowerCase() === arbmeAddr || token1.toLowerCase() === arbmeAddr
}

// Check known V2 ARBME pools without RPC
function checkKnownV2Pool(token0: string, token1: string): { exists: boolean; poolAddress?: string } | null {
  const t0 = token0.toLowerCase()
  const t1 = token1.toLowerCase()

  for (const pool of V2_ARBME_POOLS) {
    const poolT0 = pool.token0.toLowerCase()
    const poolT1 = pool.token1.toLowerCase()
    if ((t0 === poolT0 && t1 === poolT1) || (t0 === poolT1 && t1 === poolT0)) {
      return { exists: true, poolAddress: pool.address }
    }
  }
  return null // Unknown pair, need RPC
}

// Check known V4 ARBME pools without RPC
// NOTE: Only return known pools, never assume non-existence - always verify on-chain
function checkKnownV4Pool(token0: string, token1: string, fee: number): { exists: boolean; initialized: boolean } | null {
  const t0 = token0.toLowerCase()
  const t1 = token1.toLowerCase()

  for (const pool of V4_ARBME_POOLS) {
    const poolT0 = pool.token0.toLowerCase()
    const poolT1 = pool.token1.toLowerCase()
    if ((t0 === poolT0 && t1 === poolT1) || (t0 === poolT1 && t1 === poolT0)) {
      if (pool.fee === fee) {
        return { exists: true, initialized: true }
      }
    }
  }

  // Always check on-chain for V4 pools - don't assume non-existence
  return null
}

export async function POST(request: NextRequest) {
  try {
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
      // Check known pools first (no RPC needed)
      const knownResult = checkKnownV2Pool(token0, token1)
      if (knownResult) {
        console.log('[check-pool-exists] V2 known pool hit:', { token0, token1, exists: knownResult.exists })
        return NextResponse.json({
          version: 'V2',
          exists: knownResult.exists,
          poolAddress: knownResult.poolAddress || null,
        })
      }

      // For ARBME pairs not in known list, assume doesn't exist (skip RPC)
      if (isArbmePair(token0, token1)) {
        console.log('[check-pool-exists] V2 ARBME pair not in known list, assuming new pool')
        return NextResponse.json({
          version: 'V2',
          exists: false,
          poolAddress: null,
        })
      }

      // Only do RPC for non-ARBME pairs
      setAlchemyKey(ALCHEMY_KEY)
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

      // For ARBME pairs on V3, assume pool doesn't exist (we don't have V3 pools)
      if (isArbmePair(token0, token1)) {
        console.log('[check-pool-exists] V3 ARBME pair, assuming new pool')
        return NextResponse.json({
          version: 'V3',
          exists: false,
          poolAddress: null,
          fee,
        })
      }

      // Only do RPC for non-ARBME pairs
      setAlchemyKey(ALCHEMY_KEY)
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

      // Check known pools first (no RPC needed)
      const knownResult = checkKnownV4Pool(token0, token1, fee)
      if (knownResult) {
        console.log('[check-pool-exists] V4 known pool check:', { token0, token1, fee, exists: knownResult.exists })
        return NextResponse.json({
          version: 'V4',
          exists: knownResult.exists,
          initialized: knownResult.initialized,
          fee,
          tickSpacing,
        })
      }

      // Only do RPC for non-ARBME pairs
      setAlchemyKey(ALCHEMY_KEY)
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
