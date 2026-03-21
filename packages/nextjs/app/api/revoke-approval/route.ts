import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionData } from 'viem'

const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const

export async function POST(request: NextRequest) {
  try {
    const { token, spender, step } = await request.json()

    if (!token || !/^0x[a-fA-F0-9]{40}$/.test(token)) {
      return NextResponse.json({ error: 'Invalid token address' }, { status: 400 })
    }

    if (step === 'erc20') {
      // Revoke ERC20 → Permit2: approve(PERMIT2, 0)
      const data = encodeFunctionData({
        abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
        functionName: 'approve',
        args: [PERMIT2, 0n],
      })
      return NextResponse.json({
        success: true,
        transaction: { to: token, data, value: '0', gas: '100000' },
        description: 'Revoke ERC20 approval to Permit2',
      })
    }

    if (step === 'permit2') {
      if (!spender || !/^0x[a-fA-F0-9]{40}$/.test(spender)) {
        return NextResponse.json({ error: 'Invalid spender address' }, { status: 400 })
      }
      // Revoke Permit2 → spender: approve(token, spender, 0, 0)
      const data = encodeFunctionData({
        abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }], outputs: [] }],
        functionName: 'approve',
        args: [token as `0x${string}`, spender as `0x${string}`, 0n, 0],
      })
      return NextResponse.json({
        success: true,
        transaction: { to: PERMIT2, data, value: '0', gas: '100000' },
        description: 'Revoke Permit2 approval to router',
      })
    }

    return NextResponse.json({ error: 'Invalid step: must be "erc20" or "permit2"' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to build revoke tx' }, { status: 500 })
  }
}
