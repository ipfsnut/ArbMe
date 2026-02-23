import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionData } from 'viem'
import { CHAOS_STAKING_ADDRESS } from '@/utils/constants'

export async function POST(request: NextRequest) {
  try {
    const { gaugeAddress } = await request.json()

    if (!gaugeAddress || !/^0x[0-9a-fA-F]{40}$/.test(gaugeAddress)) {
      return NextResponse.json({ error: 'Invalid gauge address' }, { status: 400 })
    }

    if (gaugeAddress === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({ error: 'Cannot register zero address' }, { status: 400 })
    }

    const data = encodeFunctionData({
      abi: [{
        name: 'addExtraReward',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: '_reward', type: 'address' }],
        outputs: [{ type: 'bool' }],
      }],
      functionName: 'addExtraReward',
      args: [gaugeAddress as `0x${string}`],
    })

    return NextResponse.json({
      success: true,
      transaction: {
        to: CHAOS_STAKING_ADDRESS,
        data,
        value: '0',
      },
      description: `Register gauge ${gaugeAddress} with staking hub`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to build register tx' }, { status: 500 })
  }
}
