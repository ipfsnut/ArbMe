import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionData, maxUint256 } from 'viem'
import { CHAOS_GAUGES } from '@/utils/constants'

export async function POST(request: NextRequest) {
  try {
    const { gaugeIndex } = await request.json()

    if (gaugeIndex === undefined || gaugeIndex < 0 || gaugeIndex >= CHAOS_GAUGES.length) {
      return NextResponse.json({ error: 'Invalid gauge index' }, { status: 400 })
    }

    const gauge = CHAOS_GAUGES[gaugeIndex]
    if (gauge.gaugeAddress === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({ error: `${gauge.symbol} gauge not yet deployed` }, { status: 400 })
    }

    // Multisig approve — unlimited so it doesn't need re-approval for each notify
    const data = encodeFunctionData({
      abi: [{
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
        outputs: [{ type: 'bool' }],
      }],
      functionName: 'approve',
      args: [gauge.gaugeAddress as `0x${string}`, maxUint256],
    })

    return NextResponse.json({
      success: true,
      transaction: { to: gauge.tokenAddress, data, value: '0' },
      description: `Approve ${gauge.symbol} for ${gauge.pool} gauge`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to build approve tx' }, { status: 500 })
  }
}
