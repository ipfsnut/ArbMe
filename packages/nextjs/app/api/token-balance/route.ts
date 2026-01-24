import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, formatUnits } from 'viem'
import { base } from 'viem/chains'
import { getTokenMetadata } from '@arbme/core-lib'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export async function POST(request: NextRequest) {
  try {
    const { tokenAddress, walletAddress } = await request.json()

    if (!tokenAddress || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters: tokenAddress, walletAddress' },
        { status: 400 }
      )
    }

    // Validate addresses
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress) || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      )
    }

    const rpcUrl = ALCHEMY_KEY
      ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : 'https://mainnet.base.org'

    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    })

    // Get balance and token metadata in parallel
    const [balance, metadata] = await Promise.all([
      client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`],
      }),
      getTokenMetadata(tokenAddress, ALCHEMY_KEY),
    ])

    const balanceFormatted = formatUnits(balance, metadata.decimals)

    return NextResponse.json({
      tokenAddress,
      walletAddress,
      balanceWei: balance.toString(),
      balanceFormatted,
      decimals: metadata.decimals,
      symbol: metadata.symbol,
    })
  } catch (error: any) {
    console.error('[token-balance] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch token balance' },
      { status: 500 }
    )
  }
}
