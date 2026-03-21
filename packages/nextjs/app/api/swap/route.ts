import { NextRequest, NextResponse } from 'next/server'
import { buildSwapTransaction } from '@arbme/core-lib'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

export const maxDuration = 60

function getClient() {
  const key = process.env.ALCHEMY_API_KEY
  const rpcUrl = key ? `https://base-mainnet.g.alchemy.com/v2/${key}` : 'https://base-rpc.publicnode.com'
  return createPublicClient({ chain: base, transport: http(rpcUrl) })
}

export async function POST(request: NextRequest) {
  try {
    const { poolAddress, version, tokenIn, tokenOut, amountIn, minAmountOut, recipient, fee, tickSpacing, hooks } = await request.json()

    if (!poolAddress || !version || !tokenIn || !tokenOut || !amountIn || !minAmountOut || !recipient) {
      return NextResponse.json(
        { error: 'Missing required parameters: poolAddress, version, tokenIn, tokenOut, amountIn, minAmountOut, recipient' },
        { status: 400 }
      )
    }

    const normalizedVersion = version.toUpperCase()
    if (!['V2', 'V3', 'V4'].includes(normalizedVersion)) {
      return NextResponse.json({ error: 'Invalid version. Must be V2, V3, or V4' }, { status: 400 })
    }

    const addressRegex = /^0x[a-fA-F0-9]{40}$/
    if (!addressRegex.test(tokenIn)) return NextResponse.json({ error: 'Invalid tokenIn address' }, { status: 400 })
    if (!addressRegex.test(tokenOut)) return NextResponse.json({ error: 'Invalid tokenOut address' }, { status: 400 })
    if (!addressRegex.test(recipient)) return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 })
    if (BigInt(amountIn) <= 0n) return NextResponse.json({ error: 'amountIn must be positive' }, { status: 400 })
    if (BigInt(minAmountOut) <= 0n) return NextResponse.json({ error: 'minAmountOut must be positive' }, { status: 400 })
    if (hooks && !addressRegex.test(hooks)) return NextResponse.json({ error: 'Invalid hooks address' }, { status: 400 })

    const transaction = buildSwapTransaction({
      poolAddress,
      version: normalizedVersion as 'V2' | 'V3' | 'V4',
      tokenIn, tokenOut, amountIn, minAmountOut, recipient,
      fee: fee ?? 3000,
      tickSpacing: tickSpacing ?? 60,
      hooks,
    })

    // Validate the swap by simulating with minAmountOut=1 (no slippage check)
    // This catches approval issues, pool problems, and balance issues
    // without failing on stale quotes. On-chain slippage protection still applies.
    const client = getClient()
    const validationTx = buildSwapTransaction({
      poolAddress,
      version: normalizedVersion as 'V2' | 'V3' | 'V4',
      tokenIn, tokenOut, amountIn,
      minAmountOut: '1', // validation only — real tx uses user's slippage
      recipient,
      fee: fee ?? 3000,
      tickSpacing: tickSpacing ?? 60,
      hooks,
    })

    try {
      await client.call({
        account: recipient as `0x${string}`,
        to: validationTx.to as `0x${string}`,
        data: validationTx.data as `0x${string}`,
        value: validationTx.value !== '0' ? BigInt(validationTx.value) : 0n,
      })
    } catch (simErr: any) {
      const msg = simErr?.message || simErr?.shortMessage || 'Unknown error'
      if (msg.includes('AllowanceExpired') || msg.includes('xpir')) {
        return NextResponse.json({ error: 'Token approval expired. Please re-approve before swapping.', needsApproval: true }, { status: 400 })
      }
      if (msg.includes('Allowance') || msg.includes('allowance')) {
        return NextResponse.json({ error: 'Insufficient token approval. Please approve the swap amount first.', needsApproval: true }, { status: 400 })
      }
      if (msg.includes('PoolNotInitialized')) {
        return NextResponse.json({ error: 'Pool not found. This token pair may not have an active pool.' }, { status: 400 })
      }
      console.error('[swap] Validation failed:', msg)
      return NextResponse.json({ error: `Swap validation failed: ${msg.slice(0, 200)}`, needsApproval: msg.includes('llowance') || msg.includes('xpir') }, { status: 400 })
    }

    // Validation passed — estimate gas using the REAL tx (with user's minAmountOut)
    let gasEstimate = '500000'
    try {
      const est = await client.estimateGas({
        account: recipient as `0x${string}`,
        to: transaction.to as `0x${string}`,
        data: transaction.data as `0x${string}`,
        value: transaction.value !== '0' ? BigInt(transaction.value) : 0n,
      })
      gasEstimate = (est * 120n / 100n).toString()
    } catch {
      // Gas estimation with real minAmountOut failed — likely stale quote
      // Still return the tx, let on-chain slippage protection handle it
      console.warn('[swap] Gas estimation failed with real minAmountOut, using 500k fallback')
    }

    return NextResponse.json({
      success: true,
      transaction: {
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
        gas: gasEstimate,
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
