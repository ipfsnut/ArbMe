import { NextRequest, NextResponse } from 'next/server'
import { formatEther } from 'viem'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')

    if (!address) {
      return NextResponse.json(
        { error: 'Missing required parameter: address' },
        { status: 400 }
      )
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      )
    }

    const rpcUrl = ALCHEMY_KEY
      ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : 'https://mainnet.base.org'

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    })

    const data = await response.json()

    if (data.error) {
      throw new Error(data.error.message || 'RPC error')
    }

    const balanceWei = BigInt(data.result)
    const balanceFormatted = formatEther(balanceWei)

    return NextResponse.json({
      address,
      balance: balanceWei.toString(),
      balanceFormatted,
    })
  } catch (error: any) {
    console.error('[eth-balance] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ETH balance' },
      { status: 500 }
    )
  }
}
