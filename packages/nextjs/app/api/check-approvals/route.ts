import { NextRequest, NextResponse } from 'next/server'
import { getTokenAllowance } from '@arbme/core-lib'

export async function POST(request: NextRequest) {
  try {
    const { token0, token1, owner, spender, amount0Required, amount1Required } = await request.json()

    if (!token0 || !token1 || !owner || !spender) {
      return NextResponse.json(
        { error: 'Missing required parameters: token0, token1, owner, spender' },
        { status: 400 }
      )
    }

    // Validate addresses
    const addresses = [token0, token1, owner, spender]
    for (const addr of addresses) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return NextResponse.json(
          { error: `Invalid address format: ${addr}` },
          { status: 400 }
        )
      }
    }

    // Check allowances in parallel
    const [allowance0, allowance1] = await Promise.all([
      getTokenAllowance(token0, owner, spender),
      getTokenAllowance(token1, owner, spender),
    ])

    const amount0Needed = BigInt(amount0Required || '0')
    const amount1Needed = BigInt(amount1Required || '0')

    const token0NeedsApproval = allowance0 < amount0Needed
    const token1NeedsApproval = allowance1 < amount1Needed

    return NextResponse.json({
      token0: {
        address: token0,
        allowance: allowance0.toString(),
        needsApproval: token0NeedsApproval,
        amountRequired: amount0Needed.toString(),
      },
      token1: {
        address: token1,
        allowance: allowance1.toString(),
        needsApproval: token1NeedsApproval,
        amountRequired: amount1Needed.toString(),
      },
      anyNeedsApproval: token0NeedsApproval || token1NeedsApproval,
    })
  } catch (error: any) {
    console.error('[check-approvals] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check approvals' },
      { status: 500 }
    )
  }
}
