import { NextRequest, NextResponse } from 'next/server'
import { buildCollectFeesTransaction, canCollectFees } from '@arbme/core-lib'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { positionId, recipient, currency0, currency1 } = await request.json()

    if (!positionId || !recipient) {
      return NextResponse.json(
        { error: 'Missing required parameters: positionId, recipient' },
        { status: 400 }
      )
    }

    // Validate recipient address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      return NextResponse.json(
        { error: 'Invalid recipient address format' },
        { status: 400 }
      )
    }

    // Parse version from positionId
    const version = positionId.split('-')[0].toUpperCase()

    if (!canCollectFees(version)) {
      return NextResponse.json(
        { error: `Cannot collect fees from ${version} positions. Fees are included in LP token value.` },
        { status: 400 }
      )
    }

    // V4 requires currency addresses for TAKE_PAIR action
    if (version === 'V4' && (!currency0 || !currency1)) {
      return NextResponse.json(
        { error: 'V4 positions require currency0 and currency1 addresses' },
        { status: 400 }
      )
    }

    const transaction = buildCollectFeesTransaction({
      positionId,
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
    console.error('[collect-fees] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build collect fees transaction' },
      { status: 500 }
    )
  }
}
