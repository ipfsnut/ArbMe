import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

const PROVIDER_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org'

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
]

export async function POST(request: NextRequest) {
  try {
    const {
      token0,
      token1,
      owner,
      spender,
      amount0Required,
      amount1Required,
    } = await request.json()

    if (!token0 || !token1 || !owner || !spender) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL)

    // Create contract instances
    const token0Contract = new ethers.Contract(token0, ERC20_ABI, provider)
    const token1Contract = new ethers.Contract(token1, ERC20_ABI, provider)

    // Fetch allowances in parallel
    const [token0Allowance, token1Allowance] = await Promise.all([
      token0Contract.allowance(owner, spender),
      token1Contract.allowance(owner, spender),
    ])

    // Convert required amounts to BigNumber
    const amount0RequiredBN = ethers.BigNumber.from(amount0Required || '0')
    const amount1RequiredBN = ethers.BigNumber.from(amount1Required || '0')

    // Check if approvals are needed
    const token0NeedsApproval = token0Allowance.lt(amount0RequiredBN)
    const token1NeedsApproval = token1Allowance.lt(amount1RequiredBN)

    return NextResponse.json({
      token0NeedsApproval,
      token1NeedsApproval,
      token0Allowance: token0Allowance.toString(),
      token1Allowance: token1Allowance.toString(),
    })
  } catch (error: any) {
    console.error('[check-approvals] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check approvals' },
      { status: 500 }
    )
  }
}
