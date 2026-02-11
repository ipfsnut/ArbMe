import { NextRequest, NextResponse } from 'next/server'
import { getTokenAllowance, checkV4Approvals, setAlchemyKey } from '@arbme/core-lib'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    // Initialize Alchemy key for RPC calls
    setAlchemyKey(process.env.ALCHEMY_API_KEY)

    const { token0, token1, owner, spender, amount0Required, amount1Required, version } = await request.json()

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

    // Safely parse amounts - handle strings, numbers, and potential decimals
    const parseAmount = (val: any): bigint => {
      if (!val) return 0n
      const str = String(val)
      // Remove any decimal portion (truncate to integer)
      const intPart = str.split('.')[0]
      return BigInt(intPart)
    }

    const amount0Needed = parseAmount(amount0Required)
    const amount1Needed = parseAmount(amount1Required)

    // V4 requires Permit2 approvals (two-step: ERC20 -> Permit2, then Permit2 -> V4 PM)
    if (version?.toLowerCase() === 'v4') {
      const [v4Approvals0, v4Approvals1] = await Promise.all([
        checkV4Approvals(token0, owner, amount0Needed),
        checkV4Approvals(token1, owner, amount1Needed),
      ])

      return NextResponse.json({
        version: 'V4',
        token0: {
          address: token0,
          needsErc20Approval: v4Approvals0.needsErc20Approval,
          needsPermit2Approval: v4Approvals0.needsPermit2Approval,
          needsApproval: v4Approvals0.needsErc20Approval || v4Approvals0.needsPermit2Approval,
          amountRequired: amount0Needed.toString(),
        },
        token1: {
          address: token1,
          needsErc20Approval: v4Approvals1.needsErc20Approval,
          needsPermit2Approval: v4Approvals1.needsPermit2Approval,
          needsApproval: v4Approvals1.needsErc20Approval || v4Approvals1.needsPermit2Approval,
          amountRequired: amount1Needed.toString(),
        },
        anyNeedsApproval: v4Approvals0.needsErc20Approval || v4Approvals0.needsPermit2Approval ||
                          v4Approvals1.needsErc20Approval || v4Approvals1.needsPermit2Approval,
      })
    }

    // V2/V3: Standard ERC20 approval to the router/position manager
    const [allowance0, allowance1] = await Promise.all([
      getTokenAllowance(token0, owner, spender),
      getTokenAllowance(token1, owner, spender),
    ])

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
