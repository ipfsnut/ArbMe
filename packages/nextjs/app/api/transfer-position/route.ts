import { NextRequest, NextResponse } from 'next/server'
import { buildTransferPositionTransaction } from '@arbme/core-lib'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { from, to, tokenId, version } = await request.json()

    if (!from || !to || !tokenId || !version) {
      return NextResponse.json(
        { error: 'Missing required parameters: from, to, tokenId, version' },
        { status: 400 }
      )
    }

    // Validate address formats
    if (!/^0x[a-fA-F0-9]{40}$/.test(from)) {
      return NextResponse.json(
        { error: 'Invalid from address format' },
        { status: 400 }
      )
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      return NextResponse.json(
        { error: 'Invalid recipient address format' },
        { status: 400 }
      )
    }

    if (version !== 'V3' && version !== 'V4') {
      return NextResponse.json(
        { error: 'Version must be V3 or V4' },
        { status: 400 }
      )
    }

    const transaction = buildTransferPositionTransaction({
      from,
      to,
      tokenId: BigInt(tokenId),
      version,
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
    console.error('[transfer-position] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build transfer transaction' },
      { status: 500 }
    )
  }
}
