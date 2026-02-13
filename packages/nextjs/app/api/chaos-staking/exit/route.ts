import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionData } from 'viem'
import { CHAOS_STAKING_ADDRESS } from '@/utils/constants'

export async function POST(_request: NextRequest) {
  try {
    if (CHAOS_STAKING_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({ error: 'Contract not yet deployed' }, { status: 400 })
    }

    const data = encodeFunctionData({
      abi: [{ name: 'exit', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }],
      functionName: 'exit',
    })

    return NextResponse.json({
      success: true,
      transaction: { to: CHAOS_STAKING_ADDRESS, data, value: '0' },
      description: 'Withdraw all staked CHAOS and claim all rewards',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to build exit transaction' }, { status: 500 })
  }
}
