import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionData, maxUint256 } from 'viem'
import { CHAOS_ADDRESS, CHAOS_STAKING_ADDRESS } from '@/utils/constants'

export async function POST(_request: NextRequest) {
  try {
    if (CHAOS_STAKING_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({ error: 'Contract not yet deployed' }, { status: 400 })
    }

    const data = encodeFunctionData({
      abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
      functionName: 'approve',
      args: [CHAOS_STAKING_ADDRESS as `0x${string}`, maxUint256],
    })

    return NextResponse.json({
      success: true,
      transaction: { to: CHAOS_ADDRESS, data, value: '0' },
      description: 'Approve $CHAOS for staking',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to build approval transaction' }, { status: 500 })
  }
}
