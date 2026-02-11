import { NextRequest, NextResponse } from 'next/server'
import { buildBurnPositionTransaction } from '@arbme/core-lib'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { positionId } = await request.json()

    if (!positionId) {
      return NextResponse.json(
        { error: 'Missing required parameter: positionId' },
        { status: 400 }
      )
    }

    // Validate version (only V3/V4 supported)
    const version = positionId.split('-')[0].toLowerCase()
    if (version !== 'v3' && version !== 'v4') {
      return NextResponse.json(
        { error: 'Only V3 and V4 positions can be burned' },
        { status: 400 }
      )
    }

    const transaction = buildBurnPositionTransaction({ positionId })

    return NextResponse.json({
      success: true,
      transaction: {
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
      },
      note: 'Position must have 0 liquidity before burning. Call decreaseLiquidity(100%) first, then collect fees.',
    })
  } catch (error: any) {
    console.error('[burn-position] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build burn position transaction' },
      { status: 500 }
    )
  }
}
