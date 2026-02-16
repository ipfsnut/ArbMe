import { NextRequest, NextResponse } from 'next/server'
import { getTokenAllowance, checkV4Approvals, getPermit2Allowance, setAlchemyKey, PERMIT2, V4_POSITION_MANAGER, V4_UNIVERSAL_ROUTER } from '@arbme/core-lib'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    // Initialize Alchemy key for RPC calls
    setAlchemyKey(process.env.ALCHEMY_API_KEY)

    const { token0, token1, owner, spender, amount0Required, amount1Required, version, v4Spender } = await request.json()

    if (!token0 || !token1 || !owner) {
      return NextResponse.json(
        { error: 'Missing required parameters: token0, token1, owner' },
        { status: 400 }
      )
    }

    // Validate addresses
    const addresses = [token0, token1, owner, ...(spender ? [spender] : [])]
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

    // V4 requires Permit2 approvals (two-step: ERC20 -> Permit2, then Permit2 -> spender)
    // v4Spender can be 'universal-router' (for swaps) or default to Position Manager (for LP)
    if (version?.toLowerCase() === 'v4') {
      // Determine V4 Permit2 spender: Universal Router for swaps, Position Manager for LP
      const permit2Spender = v4Spender === 'universal-router' ? V4_UNIVERSAL_ROUTER : V4_POSITION_MANAGER

      const checkV4 = async (token: string, amount: bigint) => {
        if (amount === 0n) return { needsErc20Approval: false, needsPermit2Approval: false }
        // Check ERC20 -> Permit2
        const erc20Allowance = await getTokenAllowance(token as `0x${string}`, owner as `0x${string}`, PERMIT2)
        const needsErc20 = erc20Allowance < amount
        // Check Permit2 -> spender
        const p2Allowance = await getPermit2Allowance(token as `0x${string}`, owner as `0x${string}`, permit2Spender as `0x${string}`)
        const now = Math.floor(Date.now() / 1000)
        const needsPermit2 = p2Allowance.amount < amount || p2Allowance.expiration <= now
        return { needsErc20Approval: needsErc20, needsPermit2Approval: needsPermit2 }
      }

      const [v4Approvals0, v4Approvals1] = await Promise.all([
        checkV4(token0, amount0Needed),
        checkV4(token1, amount1Needed),
      ])

      return NextResponse.json({
        version: 'V4',
        v4Spender: permit2Spender,
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
    if (!spender) {
      return NextResponse.json(
        { error: 'Missing required parameter: spender (for V2/V3)' },
        { status: 400 }
      )
    }

    const [allowance0, allowance1] = await Promise.all([
      getTokenAllowance(token0 as `0x${string}`, owner as `0x${string}`, spender as `0x${string}`),
      getTokenAllowance(token1 as `0x${string}`, owner as `0x${string}`, spender as `0x${string}`),
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
