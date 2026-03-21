import { NextRequest, NextResponse } from 'next/server'
import { buildApproveTransaction, buildPermit2ApproveTransaction, PERMIT2, V4_POSITION_MANAGER, V4_UNIVERSAL_ROUTER } from '@arbme/core-lib'

export const maxDuration = 60

const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
const THIRTY_DAYS = 30 * 24 * 60 * 60

export async function POST(request: NextRequest) {
  try {
    const { token, spender, amount, approvalType, version, v4Spender, expiration } = await request.json()

    if (!token) {
      return NextResponse.json(
        { error: 'Missing required parameter: token' },
        { status: 400 }
      )
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
      return NextResponse.json(
        { error: 'Invalid token address format' },
        { status: 400 }
      )
    }

    // Parse amount if provided
    const parsedAmount = amount !== undefined && amount !== null ? BigInt(amount) : undefined
    const isUnlimited = parsedAmount === undefined

    // V4 approval flow: two types of approvals needed
    // 1. ERC20 approve token -> Permit2 (approvalType = 'erc20')
    // 2. Permit2.approve token -> V4 spender (approvalType = 'permit2')
    if (version?.toLowerCase() === 'v4') {
      const permit2Target = v4Spender === 'universal-router' ? V4_UNIVERSAL_ROUTER : V4_POSITION_MANAGER
      const targetName = v4Spender === 'universal-router' ? 'Universal Router' : 'Position Manager'

      if (approvalType === 'permit2') {
        const permit2Expiration = expiration ?? Math.floor(Date.now() / 1000) + THIRTY_DAYS
        const transaction = buildPermit2ApproveTransaction(
          token as `0x${string}`,
          permit2Target,
          parsedAmount,
          permit2Expiration,
        )
        return NextResponse.json({
          success: true,
          version: 'V4',
          approvalType: 'permit2',
          transaction: {
            to: transaction.to,
            data: transaction.data,
            value: transaction.value,
            gas: '100000',
          },
          approvalAmount: parsedAmount?.toString() ?? MAX_UINT256,
          isUnlimited,
          description: `Grant V4 ${targetName} permission via Permit2`,
        })
      } else {
        // ERC20 approve token -> Permit2
        const transaction = buildApproveTransaction(token as `0x${string}`, PERMIT2, parsedAmount)
        return NextResponse.json({
          success: true,
          version: 'V4',
          approvalType: 'erc20',
          transaction: {
            to: transaction.to,
            data: transaction.data,
            value: transaction.value,
            gas: '100000',
          },
          approvalAmount: parsedAmount?.toString() ?? MAX_UINT256,
          isUnlimited,
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

    const transaction = buildApproveTransaction(token as `0x${string}`, spender as `0x${string}`, parsedAmount)

    return NextResponse.json({
      success: true,
      transaction: {
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
        gas: '100000',
      },
      approvalAmount: parsedAmount?.toString() ?? MAX_UINT256,
      isUnlimited,
    })
  } catch (error: any) {
    console.error('[build-approval] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build approval transaction' },
      { status: 500 }
    )
  }
}
