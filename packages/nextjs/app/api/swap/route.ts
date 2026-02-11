import { NextRequest, NextResponse } from 'next/server'
import { buildSwapTransaction } from '@arbme/core-lib'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { poolAddress, version, tokenIn, tokenOut, amountIn, minAmountOut, recipient, fee, tickSpacing, hooks } = await request.json()

    if (!poolAddress || !version || !tokenIn || !tokenOut || !amountIn || !minAmountOut || !recipient) {
      return NextResponse.json(
        { error: 'Missing required parameters: poolAddress, version, tokenIn, tokenOut, amountIn, minAmountOut, recipient' },
        { status: 400 }
      )
    }

    // Validate version
    const normalizedVersion = version.toUpperCase()
    if (!['V2', 'V3', 'V4'].includes(normalizedVersion)) {
      return NextResponse.json(
        { error: 'Invalid version. Must be V2, V3, or V4' },
        { status: 400 }
      )
    }

    // Validate addresses
    const addressRegex = /^0x[a-fA-F0-9]{40}$/
    if (!addressRegex.test(tokenIn)) {
      return NextResponse.json({ error: 'Invalid tokenIn address' }, { status: 400 })
    }
    if (!addressRegex.test(tokenOut)) {
      return NextResponse.json({ error: 'Invalid tokenOut address' }, { status: 400 })
    }
    if (!addressRegex.test(recipient)) {
      return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 })
    }

    // Validate amounts are positive
    if (BigInt(amountIn) <= 0n) {
      return NextResponse.json({ error: 'amountIn must be positive' }, { status: 400 })
    }
    if (BigInt(minAmountOut) < 0n) {
      return NextResponse.json({ error: 'minAmountOut cannot be negative' }, { status: 400 })
    }

    // Validate hooks address if provided
    const addressRegex2 = /^0x[a-fA-F0-9]{40}$/
    if (hooks && !addressRegex2.test(hooks)) {
      return NextResponse.json({ error: 'Invalid hooks address' }, { status: 400 })
    }

    const transaction = buildSwapTransaction({
      poolAddress,
      version: normalizedVersion as 'V2' | 'V3' | 'V4',
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      recipient,
      fee: fee || 3000,
      tickSpacing: tickSpacing || 60,
      hooks,
    })

    return NextResponse.json({
      success: true,
      transaction: {
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
      },
    })
  } catch (error: any) {
    console.error('[swap] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build swap transaction' },
      { status: 500 }
    )
  }
}
