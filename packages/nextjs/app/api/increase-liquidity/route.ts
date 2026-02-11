import { NextRequest, NextResponse } from 'next/server'
import { buildIncreaseLiquidityTransaction } from '@arbme/core-lib'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { positionId, amount0Desired, amount1Desired, slippageTolerance } = await request.json()

    if (!positionId || !amount0Desired || !amount1Desired) {
      return NextResponse.json(
        { error: 'Missing required parameters: positionId, amount0Desired, amount1Desired' },
        { status: 400 }
      )
    }

    // Validate version (only V3/V4 supported)
    const version = positionId.split('-')[0].toLowerCase()
    if (version !== 'v3' && version !== 'v4') {
      return NextResponse.json(
        { error: 'Only V3 and V4 positions support increase liquidity' },
        { status: 400 }
      )
    }

    const transaction = buildIncreaseLiquidityTransaction({
      positionId,
      amount0Desired,
      amount1Desired,
      slippageTolerance: slippageTolerance || 0.5,
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
    console.error('[increase-liquidity] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build increase liquidity transaction' },
      { status: 500 }
    )
  }
}
