import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

const PROVIDER_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org'

// Minimal ERC20 ABI
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

export async function POST(request: NextRequest) {
  try {
    const { tokenAddress, walletAddress } = await request.json()

    if (!tokenAddress || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL)
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)

    // Fetch balance and decimals in parallel
    const [balanceWei, decimals] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
    ])

    // Format balance
    const balanceFormatted = ethers.utils.formatUnits(balanceWei, decimals)

    return NextResponse.json({
      balanceWei: balanceWei.toString(),
      balanceFormatted,
      decimals: Number(decimals),
    })
  } catch (error: any) {
    console.error('[token-balance] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch balance' },
      { status: 500 }
    )
  }
}
