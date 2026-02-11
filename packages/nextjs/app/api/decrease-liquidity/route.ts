import { NextRequest, NextResponse } from 'next/server'
import { buildDecreaseLiquidityTransaction } from '@arbme/core-lib'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { positionId, liquidityPercentage, currentLiquidity, slippageTolerance, recipient, currency0, currency1 } = await request.json()

    if (!positionId || liquidityPercentage === undefined || !currentLiquidity) {
      return NextResponse.json(
        { error: 'Missing required parameters: positionId, liquidityPercentage, currentLiquidity' },
        { status: 400 }
      )
    }

    // Validate liquidityPercentage (0-100)
    if (liquidityPercentage < 0 || liquidityPercentage > 100) {
      return NextResponse.json(
        { error: 'liquidityPercentage must be between 0 and 100' },
        { status: 400 }
      )
    }

    // Validate version (only V3/V4 supported)
    const version = positionId.split('-')[0].toLowerCase()
    if (version !== 'v3' && version !== 'v4') {
      return NextResponse.json(
        { error: 'Only V3 and V4 positions support decrease liquidity' },
        { status: 400 }
      )
    }

    // V4 requires currency addresses and recipient for TAKE_PAIR
    if (version === 'v4' && (!currency0 || !currency1 || !recipient)) {
      return NextResponse.json(
        { error: 'V4 positions require currency0, currency1, and recipient' },
        { status: 400 }
      )
    }

    const transaction = buildDecreaseLiquidityTransaction({
      positionId,
      liquidityPercentage,
      currentLiquidity,
      slippageTolerance: slippageTolerance || 0.5,
      recipient,
      currency0,
      currency1,
    })

    return NextResponse.json({
      success: true,
      transaction: {
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
      },
    })
  } catch (error: any) {
    console.error('[decrease-liquidity] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build decrease liquidity transaction' },
      { status: 500 }
    )
  }
}
