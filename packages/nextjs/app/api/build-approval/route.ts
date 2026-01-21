import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
]

export async function POST(request: NextRequest) {
  try {
    const { token, spender, amount, unlimited } = await request.json()

    if (!token || !spender) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Determine approval amount
    const isUnlimited = unlimited === true && !amount
    const approvalAmount = isUnlimited
      ? ethers.constants.MaxUint256
      : ethers.BigNumber.from(amount || '0') // amount should already be in wei

    // Create contract interface
    const iface = new ethers.utils.Interface(ERC20_ABI)

    // Encode the approve function call
    const data = iface.encodeFunctionData('approve', [spender, approvalAmount])

    return NextResponse.json({
      to: token,
      data,
      value: '0x0',
      approvalAmount: approvalAmount.toString(),
      isUnlimited,
    })
  } catch (error: any) {
    console.error('[build-approval] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build approval' },
      { status: 500 }
    )
  }
}
