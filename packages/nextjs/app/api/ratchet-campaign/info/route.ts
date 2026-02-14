import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { RATCHET_CAMPAIGN_ADDRESS, CHAOS_STAKING_ADDRESS } from '@/utils/constants'

const CAMPAIGN_ABI = [
  { name: 'active', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'totalClaimed', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'MAX_CLAIMS', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'REWARD_AMOUNT', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'hasClaimed', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'bool' }] },
  { name: 'excluded', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'bool' }] },
] as const

const HUB_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.ALCHEMY_API_KEY
        ? `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
        : 'https://mainnet.base.org'
    ),
  })
}

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get('wallet')

    if (RATCHET_CAMPAIGN_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({
        active: false,
        totalClaimed: 0,
        maxClaims: 100,
        rewardAmount: '1000000000000000000000000',
        userEligible: false,
        userClaimed: false,
        userExcluded: false,
        userStaking: false,
      })
    }

    const client = getClient()
    const campaignAddr = RATCHET_CAMPAIGN_ADDRESS as `0x${string}`
    const hubAddr = CHAOS_STAKING_ADDRESS as `0x${string}`

    // Read campaign-level state
    const [active, totalClaimed, maxClaims, rewardAmount] = await Promise.all([
      client.readContract({ address: campaignAddr, abi: CAMPAIGN_ABI, functionName: 'active' }),
      client.readContract({ address: campaignAddr, abi: CAMPAIGN_ABI, functionName: 'totalClaimed' }),
      client.readContract({ address: campaignAddr, abi: CAMPAIGN_ABI, functionName: 'MAX_CLAIMS' }),
      client.readContract({ address: campaignAddr, abi: CAMPAIGN_ABI, functionName: 'REWARD_AMOUNT' }),
    ])

    let userClaimed = false
    let userExcluded = false
    let userStaking = false

    if (wallet) {
      const walletAddr = wallet as `0x${string}`
      const [claimed, excluded, hubBalance] = await Promise.all([
        client.readContract({ address: campaignAddr, abi: CAMPAIGN_ABI, functionName: 'hasClaimed', args: [walletAddr] }),
        client.readContract({ address: campaignAddr, abi: CAMPAIGN_ABI, functionName: 'excluded', args: [walletAddr] }),
        client.readContract({ address: hubAddr, abi: HUB_ABI, functionName: 'balanceOf', args: [walletAddr] }),
      ])
      userClaimed = claimed
      userExcluded = excluded
      userStaking = hubBalance > 0n
    }

    const userEligible = active && !userClaimed && !userExcluded && userStaking && totalClaimed < maxClaims

    return NextResponse.json({
      active,
      totalClaimed: Number(totalClaimed),
      maxClaims: Number(maxClaims),
      rewardAmount: rewardAmount.toString(),
      userEligible,
      userClaimed,
      userExcluded,
      userStaking,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch campaign info' }, { status: 500 })
  }
}
