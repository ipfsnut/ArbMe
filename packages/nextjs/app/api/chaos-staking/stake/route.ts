import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionData } from 'viem'
import { CHAOS_STAKING_ADDRESS } from '@/utils/constants'

export async function POST(request: NextRequest) {
  try {
    const { amount } = await request.json()
    if (!amount) return NextResponse.json({ error: 'Missing amount' }, { status: 400 })
    try { BigInt(amount) } catch { return NextResponse.json({ error: 'Invalid amount' }, { status: 400 }) }
    if (CHAOS_STAKING_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({ error: 'Contract not yet deployed' }, { status: 400 })
    }

    const data = encodeFunctionData({
      abi: [{ name: 'stake', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] }],
      functionName: 'stake',
      args: [BigInt(amount)],
    })

    return NextResponse.json({
      success: true,
      transaction: { to: CHAOS_STAKING_ADDRESS, data, value: '0' },
      description: 'Stake $CHAOS tokens',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to build stake transaction' }, { status: 500 })
  }
}
