import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionData } from 'viem'
import { RATCHET_CAMPAIGN_ADDRESS } from '@/utils/constants'

export async function POST(_request: NextRequest) {
  try {
    if (RATCHET_CAMPAIGN_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({ error: 'Campaign contract not yet deployed' }, { status: 400 })
    }

    const data = encodeFunctionData({
      abi: [{ name: 'claim', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }],
      functionName: 'claim',
    })

    return NextResponse.json({
      success: true,
      transaction: { to: RATCHET_CAMPAIGN_ADDRESS, data, value: '0' },
      description: 'Claim 1M RATCHET',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to build claim transaction' }, { status: 500 })
  }
}
