import { NextRequest, NextResponse } from 'next/server'
import { buildApproveTransaction } from '@arbme/core-lib'

const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935'

export async function POST(request: NextRequest) {
  try {
    const { token, spender, amount, unlimited } = await request.json()

    if (!token || !spender) {
      return NextResponse.json(
        { error: 'Missing required parameters: token, spender' },
        { status: 400 }
      )
    }

    // Validate addresses
    if (!/^0x[a-fA-F0-9]{40}$/.test(token) || !/^0x[a-fA-F0-9]{40}$/.test(spender)) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      )
    }

    // Build approval transaction (always unlimited for simplicity)
    const transaction = buildApproveTransaction(token, spender)

    return NextResponse.json({
      success: true,
      transaction: {
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
      },
      approvalAmount: unlimited !== false ? MAX_UINT256 : (amount || MAX_UINT256),
      isUnlimited: unlimited !== false,
    })
  } catch (error: any) {
    console.error('[build-approval] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build approval transaction' },
      { status: 500 }
    )
  }
}
