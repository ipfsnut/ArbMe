import { NextRequest, NextResponse } from 'next/server'
import { buildCollectFeesTransaction } from '@arbme/core-lib'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { positionId, recipient } = body

    if (!positionId || typeof positionId !== 'string') {
      return NextResponse.json(
        { error: 'Position ID required' },
        { status: 400 }
      )
    }

    if (!recipient || typeof recipient !== 'string') {
      return NextResponse.json(
        { error: 'Recipient address required' },
        { status: 400 }
      )
    }

    console.log(`[API] Building collect fees transaction for position: ${positionId}`)
    const transaction = buildCollectFeesTransaction({ positionId, recipient })

    return NextResponse.json(transaction)
  } catch (error) {
    console.error('[API] Failed to build collect fees transaction:', error)
    return NextResponse.json(
      { error: 'Failed to build transaction' },
      { status: 500 }
    )
  }
}
