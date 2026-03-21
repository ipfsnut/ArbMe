import { NextRequest, NextResponse } from 'next/server'
import { buildStakingApprovalTransaction, RATCHET_STAKING_ADDRESS } from '@arbme/core-lib'

export async function POST(request: NextRequest) {
  try {
    const { amount } = await request.json().catch(() => ({}))

    if (!amount) {
      return NextResponse.json({ error: 'Missing amount' }, { status: 400 })
    }

    // Check if staking contract is deployed
    if (RATCHET_STAKING_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json(
        { error: 'Staking contract not yet deployed' },
        { status: 400 }
      )
    }

    // Build approval transaction with exact amount
    const transaction = buildStakingApprovalTransaction(amount)

    return NextResponse.json({
      success: true,
      transaction: {
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
      },
      description: 'Approve $RATCHET for staking',
      isUnlimited: !amount,
    })
  } catch (error: any) {
    console.error('[staking/approve] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build approval transaction' },
      { status: 500 }
    )
  }
}
