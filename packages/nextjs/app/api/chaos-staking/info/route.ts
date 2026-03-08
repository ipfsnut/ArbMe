import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, formatUnits } from 'viem'
import { base } from 'viem/chains'
import { CHAOS_STAKING_ADDRESS, CHAOSLP_ADDRESS, CHAOS_GAUGES } from '@/utils/constants'

const STAKING_ABI = [
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'earned', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'rewardRate', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'periodFinish', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'rewardsDuration', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

const GAUGE_ABI = [
  { name: 'earned', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'rewardRate', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'periodFinish', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'rewardsDuration', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
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

async function fetchTokenPrices(addresses: string[]): Promise<Record<string, number>> {
  try {
    const joined = addresses.map(a => a.toLowerCase()).join('%2C')
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${joined}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return {}
    const json = await res.json() as { data?: { attributes?: { token_prices?: Record<string, string> } } }
    const prices: Record<string, number> = {}
    const raw = json.data?.attributes?.token_prices || {}
    for (const [addr, price] of Object.entries(raw)) {
      prices[addr.toLowerCase()] = parseFloat(price) || 0
    }
    return prices
  } catch {
    return {}
  }
}

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get('wallet')

    // If contracts not deployed, return config-only response
    if (CHAOS_STAKING_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({
        contractDeployed: false,
        totalStaked: '0',
        rewardRate: '0',
        periodFinish: 0,
        hubApr: 0,
        totalApr: 0,
        staked: '0',
        earned: '0',
        allowance: '0',
        balance: '0',
        gauges: CHAOS_GAUGES.map(g => ({
          ...g,
          rewardRate: '0',
          periodFinish: 0,
          earned: '0',
          apr: 0,
          inAssetApr: 0,
          status: 'pending' as const,
        })),
      })
    }

    const client = getClient()
    const stakingAddr = CHAOS_STAKING_ADDRESS as `0x${string}`
    const chaosAddr = CHAOSLP_ADDRESS as `0x${string}`
    const walletAddr = wallet as `0x${string}` | undefined

    // Read hub state + token prices in parallel
    const allTokenAddrs = [CHAOSLP_ADDRESS, ...CHAOS_GAUGES.map(g => g.tokenAddress)]
    const [contractData, prices] = await Promise.all([
      Promise.all([
        client.readContract({ address: stakingAddr, abi: STAKING_ABI, functionName: 'totalSupply' }),
        client.readContract({ address: stakingAddr, abi: STAKING_ABI, functionName: 'rewardRate' }),
        client.readContract({ address: stakingAddr, abi: STAKING_ABI, functionName: 'periodFinish' }),
        client.readContract({ address: stakingAddr, abi: STAKING_ABI, functionName: 'rewardsDuration' }),
      ]),
      fetchTokenPrices(allTokenAddrs),
    ])
    const [totalSupply, rewardRate, periodFinish, rewardsDuration] = contractData
    const chaoslpPrice = prices[CHAOSLP_ADDRESS.toLowerCase()] || 0

    // Hub APR: (rewardRate * 365 days) / totalSupply * 100
    const now = Math.floor(Date.now() / 1000)
    let hubApr = 0
    if (totalSupply > 0n && Number(periodFinish) > now) {
      hubApr = Number(rewardRate * 365n * 86400n * 100n * 10000n / totalSupply) / 10000
    }

    // User-specific data
    let staked = '0', earned = '0', allowance = '0', balance = '0'
    if (walletAddr) {
      const [s, e, a, b] = await Promise.all([
        client.readContract({ address: stakingAddr, abi: STAKING_ABI, functionName: 'balanceOf', args: [walletAddr] }),
        client.readContract({ address: stakingAddr, abi: STAKING_ABI, functionName: 'earned', args: [walletAddr] }),
        client.readContract({ address: chaosAddr, abi: ERC20_ABI, functionName: 'allowance', args: [walletAddr, stakingAddr] }),
        client.readContract({ address: chaosAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddr] }),
      ])
      staked = s.toString()
      earned = e.toString()
      allowance = a.toString()
      balance = b.toString()
    }

    // Read each gauge
    const totalSupplyFloat = Number(formatUnits(totalSupply, 18))
    const gaugeData = await Promise.all(
      CHAOS_GAUGES.map(async (g) => {
        if (g.gaugeAddress === '0x0000000000000000000000000000000000000000') {
          return { ...g, rewardRate: '0', periodFinish: 0, earned: '0', apr: 0, inAssetApr: 0, status: 'pending' as const }
        }

        const addr = g.gaugeAddress as `0x${string}`
        const [gRewardRate, gPeriodFinish, gEarned] = await Promise.all([
          client.readContract({ address: addr, abi: GAUGE_ABI, functionName: 'rewardRate' }),
          client.readContract({ address: addr, abi: GAUGE_ABI, functionName: 'periodFinish' }),
          walletAddr
            ? client.readContract({ address: addr, abi: GAUGE_ABI, functionName: 'earned', args: [walletAddr] })
            : 0n,
        ])

        let inAssetApr = 0
        let apr = 0
        if (totalSupply > 0n && Number(gPeriodFinish) > now) {
          const annualRaw = gRewardRate * 365n * 86400n
          inAssetApr = Number(formatUnits(annualRaw, g.decimals)) / totalSupplyFloat

          // USD-based APR %
          const rewardPrice = prices[g.tokenAddress.toLowerCase()] || 0
          if (chaoslpPrice > 0 && rewardPrice > 0) {
            const annualTokens = Number(formatUnits(annualRaw, g.decimals))
            apr = (annualTokens * rewardPrice) / (totalSupplyFloat * chaoslpPrice) * 100
          }
        }

        const status = Number(gPeriodFinish) > now ? 'live' : Number(gPeriodFinish) > 0 ? 'ended' : 'pending'

        return {
          ...g,
          rewardRate: gRewardRate.toString(),
          periodFinish: Number(gPeriodFinish),
          earned: gEarned.toString(),
          apr,
          inAssetApr,
          status,
        }
      })
    )

    // Total APR = hub + spoke gauges (exclude CHAOSLP hub gauge to avoid double-counting)
    const spokeApr = gaugeData.filter(g => g.symbol !== 'CHAOSLP').reduce((sum, g) => sum + g.apr, 0)
    const totalApr = hubApr + spokeApr

    return NextResponse.json({
      contractDeployed: true,
      totalStaked: totalSupply.toString(),
      rewardRate: rewardRate.toString(),
      periodFinish: Number(periodFinish),
      hubApr,
      totalApr,
      staked,
      earned,
      allowance,
      balance,
      gauges: gaugeData,
    })
  } catch (error: any) {
    console.error('[chaos-staking/info] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch CHAOS staking info' },
      { status: 500 }
    )
  }
}
