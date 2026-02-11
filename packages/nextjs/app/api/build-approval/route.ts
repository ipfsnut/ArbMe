import { NextRequest, NextResponse } from 'next/server'
import { buildApproveTransaction, buildPermit2ApproveTransaction, PERMIT2, V4_POSITION_MANAGER } from '@arbme/core-lib'

export const maxDuration = 60

const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935'

export async function POST(request: NextRequest) {
  try {
    const { token, spender, amount, unlimited, approvalType, version } = await request.json()

    if (!token) {
      return NextResponse.json(
        { error: 'Missing required parameter: token' },
        { status: 400 }
      )
    }

    // Validate token address
    if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
      return NextResponse.json(
        { error: 'Invalid token address format' },
        { status: 400 }
      )
    }

    // V4 approval flow: two types of approvals needed
    // 1. ERC20 approve token -> Permit2 (approvalType = 'erc20')
    // 2. Permit2.approve token -> V4_POSITION_MANAGER (approvalType = 'permit2')
    if (version?.toLowerCase() === 'v4') {
      if (approvalType === 'permit2') {
        // Build Permit2.approve(token, V4_POSITION_MANAGER, amount, expiration)
        const transaction = buildPermit2ApproveTransaction(token, V4_POSITION_MANAGER)
        return NextResponse.json({
          success: true,
          version: 'V4',
          approvalType: 'permit2',
          transaction: {
            to: transaction.to,
            data: transaction.data,
            value: transaction.value,
          },
          description: 'Grant V4 Position Manager permission to use Permit2',
        })
      } else {
        // Default: ERC20 approve token -> Permit2
        const transaction = buildApproveTransaction(token, PERMIT2)
        return NextResponse.json({
          success: true,
          version: 'V4',
          approvalType: 'erc20',
          transaction: {
            to: transaction.to,
            data: transaction.data,
            value: transaction.value,
          },
          description: 'Approve token for Permit2',
        })
      }
    }

    // V2/V3: Standard ERC20 approval
    if (!spender) {
      return NextResponse.json(
        { error: 'Missing required parameter: spender (for V2/V3)' },
        { status: 400 }
      )
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(spender)) {
      return NextResponse.json(
        { error: 'Invalid spender address format' },
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
