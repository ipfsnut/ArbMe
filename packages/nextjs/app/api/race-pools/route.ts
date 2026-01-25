import { NextResponse } from 'next/server'
import { createPublicClient, http, Address, keccak256, parseAbiItem, formatUnits } from 'viem'
import { base } from 'viem/chains'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// V4 contracts on Base
const V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc'
const V4_POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b'

// The 8 competing position IDs
const RACE_POSITION_IDS = [
  '1016630',
  '1016620',
  '1016603',
  '1016592',
  '1016591',
  '1016589',
  '1016586',
  '1016580',
]

// Race end time: Midnight UTC, Saturday Feb 1, 2026
const RACE_END_TIME = new Date('2026-02-01T00:00:00Z').getTime()

// 24 hours in milliseconds
const DAY_MS = 24 * 60 * 60 * 1000

// Base block time is ~2 seconds, so ~43200 blocks per day
const BLOCKS_PER_DAY = 43200

const V4_NFT_ABI = [
  {
    name: 'getPoolAndPositionInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: 'poolKey',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      { name: 'info', type: 'uint256' },
    ],
  },
] as const

const ERC20_ABI = [
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

// V4 Swap event: Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)
const SWAP_EVENT = parseAbiItem(
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)'
)

interface PoolKey {
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  hooks: string
}

interface RacePool {
  positionId: string
  token0: { symbol: string; address: string; decimals: number }
  token1: { symbol: string; address: string; decimals: number }
  fee: number
  volume24h: number
  swapCount24h: number
  poolId: string
  rank: number
  volumeSource: 'on-chain' | 'gecko' | 'unavailable'
}

// Token price cache
const priceCache = new Map<string, number>()

/**
 * Calculate V4 pool ID from pool key
 */
function calculatePoolId(poolKey: PoolKey): `0x${string}` {
  const encoded =
    poolKey.currency0.slice(2).toLowerCase().padStart(64, '0') +
    poolKey.currency1.slice(2).toLowerCase().padStart(64, '0') +
    poolKey.fee.toString(16).padStart(64, '0') +
    poolKey.tickSpacing.toString(16).padStart(64, '0') +
    poolKey.hooks.slice(2).toLowerCase().padStart(64, '0')

  return keccak256(`0x${encoded}` as `0x${string}`)
}

/**
 * Get token symbol
 */
async function getTokenSymbol(client: any, address: string): Promise<string> {
  if (address === '0x0000000000000000000000000000000000000000') {
    return 'ETH'
  }
  try {
    const symbol = await client.readContract({
      address: address as Address,
      abi: ERC20_ABI,
      functionName: 'symbol',
    })
    return symbol as string
  } catch {
    return address.slice(0, 6) + '...'
  }
}

/**
 * Get token decimals
 */
async function getTokenDecimals(client: any, address: string): Promise<number> {
  if (address === '0x0000000000000000000000000000000000000000') {
    return 18 // ETH
  }
  try {
    const decimals = await client.readContract({
      address: address as Address,
      abi: ERC20_ABI,
      functionName: 'decimals',
    })
    return Number(decimals)
  } catch {
    return 18
  }
}

/**
 * Get token USD price from GeckoTerminal
 */
async function getTokenPrice(tokenAddress: string): Promise<number> {
  const normalized = tokenAddress.toLowerCase()

  // Use WETH for native ETH
  const lookupAddress = normalized === '0x0000000000000000000000000000000000000000'
    ? '0x4200000000000000000000000000000000000006'
    : normalized

  // Check cache
  if (priceCache.has(lookupAddress)) {
    return priceCache.get(lookupAddress)!
  }

  try {
    const url = `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${lookupAddress}`
    const res = await fetch(url, { next: { revalidate: 60 } })

    if (!res.ok) {
      console.log(`[Price] Failed to fetch price for ${lookupAddress}: ${res.status}`)
      return 0
    }

    const data = await res.json() as any
    const price = parseFloat(data?.data?.attributes?.token_prices?.[lookupAddress] || '0')

    priceCache.set(lookupAddress, price)
    return price
  } catch (error) {
    console.error(`[Price] Error fetching price for ${tokenAddress}:`, error)
    return 0
  }
}

/**
 * Fallback: Get volume from GeckoTerminal (returns V3 pool volume for the token pair)
 */
async function getGeckoTerminalVolume(
  token0: string,
  token1: string
): Promise<{ volume: number; source: 'gecko' }> {
  try {
    const searchToken = token0 === '0x0000000000000000000000000000000000000000'
      ? '0x4200000000000000000000000000000000000006'
      : token0

    const url = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${searchToken}/pools?page=1`
    const res = await fetch(url, { next: { revalidate: 60 } })

    if (!res.ok) return { volume: 0, source: 'gecko' }

    const data = await res.json() as any
    const pools = data?.data || []

    const normalizedToken1 = token1 === '0x0000000000000000000000000000000000000000'
      ? '0x4200000000000000000000000000000000000006'.toLowerCase()
      : token1.toLowerCase()

    // Find pools with both tokens
    for (const pool of pools) {
      const relationships = pool.relationships
      const baseTokenId = relationships?.base_token?.data?.id || ''
      const quoteTokenId = relationships?.quote_token?.data?.id || ''
      const baseToken = baseTokenId.split('_')[1]?.toLowerCase() || ''
      const quoteToken = quoteTokenId.split('_')[1]?.toLowerCase() || ''

      if (baseToken === normalizedToken1 || quoteToken === normalizedToken1) {
        const volume = parseFloat(pool.attributes?.volume_usd?.h24 || '0')
        return { volume, source: 'gecko' }
      }
    }

    return { volume: 0, source: 'gecko' }
  } catch {
    return { volume: 0, source: 'gecko' }
  }
}

// Alchemy free tier limits to 10 blocks per request, so we batch
const BLOCKS_PER_BATCH = 2000 // Most RPCs allow 2000 blocks

/**
 * Fetch V4 swap events for a pool and calculate 24h volume in USD
 * Uses batched requests to work around RPC limitations
 */
async function getPoolVolume24h(
  client: any,
  poolId: `0x${string}`,
  token0: { address: string; decimals: number },
  token1: { address: string; decimals: number }
): Promise<{ volumeUsd: number; swapCount: number }> {
  try {
    const currentBlock = await client.getBlockNumber()
    const targetFromBlock = currentBlock - BigInt(BLOCKS_PER_DAY)

    console.log(`[Volume] Fetching swaps for pool ${poolId.slice(0, 10)}... from block ${targetFromBlock}`)

    // Fetch swap events in batches
    const allLogs: any[] = []
    let fromBlock = targetFromBlock

    while (fromBlock < currentBlock) {
      const toBlock = fromBlock + BigInt(BLOCKS_PER_BATCH) > currentBlock
        ? currentBlock
        : fromBlock + BigInt(BLOCKS_PER_BATCH)

      try {
        const logs = await client.getLogs({
          address: V4_POOL_MANAGER as Address,
          event: SWAP_EVENT,
          args: {
            id: poolId,
          },
          fromBlock,
          toBlock,
        })
        allLogs.push(...logs)
      } catch (batchError: any) {
        // If batch is too large, try smaller batches
        if (batchError.details?.includes('block range')) {
          console.log(`[Volume] Batch too large, trying smaller range...`)
          // Try with 10 block range (Alchemy free tier)
          const smallerBatchSize = 10n
          let smallFrom = fromBlock
          while (smallFrom < toBlock) {
            const smallTo = smallFrom + smallerBatchSize > toBlock
              ? toBlock
              : smallFrom + smallerBatchSize
            try {
              const logs = await client.getLogs({
                address: V4_POOL_MANAGER as Address,
                event: SWAP_EVENT,
                args: { id: poolId },
                fromBlock: smallFrom,
                toBlock: smallTo,
              })
              allLogs.push(...logs)
            } catch {
              // Skip failed batch
            }
            smallFrom = smallTo + 1n
          }
        }
      }

      fromBlock = toBlock + 1n
    }

    console.log(`[Volume] Found ${allLogs.length} swaps for pool ${poolId.slice(0, 10)}...`)

    if (allLogs.length === 0) {
      return { volumeUsd: 0, swapCount: 0 }
    }

    // Get token prices
    const [price0, price1] = await Promise.all([
      getTokenPrice(token0.address),
      getTokenPrice(token1.address),
    ])

    console.log(`[Volume] Prices: token0=$${price0}, token1=$${price1}`)

    // Calculate total volume
    let totalVolumeUsd = 0

    for (const log of allLogs) {
      const { amount0, amount1 } = log.args as { amount0: bigint; amount1: bigint }

      // Use absolute values - swap amounts are signed (negative = out, positive = in)
      const absAmount0 = amount0 < 0n ? -amount0 : amount0
      const absAmount1 = amount1 < 0n ? -amount1 : amount1

      // Convert to human-readable amounts
      const humanAmount0 = parseFloat(formatUnits(absAmount0, token0.decimals))
      const humanAmount1 = parseFloat(formatUnits(absAmount1, token1.decimals))

      // Calculate USD volume (use the token with a valid price, or average if both have prices)
      let swapVolumeUsd = 0
      if (price0 > 0 && price1 > 0) {
        // Use average of both sides
        swapVolumeUsd = (humanAmount0 * price0 + humanAmount1 * price1) / 2
      } else if (price0 > 0) {
        swapVolumeUsd = humanAmount0 * price0
      } else if (price1 > 0) {
        swapVolumeUsd = humanAmount1 * price1
      }

      totalVolumeUsd += swapVolumeUsd
    }

    return { volumeUsd: totalVolumeUsd, swapCount: allLogs.length }
  } catch (error) {
    console.error(`[Volume] Error fetching volume for pool ${poolId}:`, error)
    return { volumeUsd: 0, swapCount: 0 }
  }
}

export async function GET() {
  try {
    // Use public Base RPC for getLogs (supports larger block ranges than Alchemy free tier)
    // Alchemy is used for contract reads
    const alchemyUrl = ALCHEMY_KEY
      ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : 'https://mainnet.base.org'

    // Public Base RPC for log queries
    const publicRpcUrl = 'https://mainnet.base.org'

    const client = createPublicClient({
      chain: base,
      transport: http(alchemyUrl),
    })

    // Separate client for logs with public RPC
    const logsClient = createPublicClient({
      chain: base,
      transport: http(publicRpcUrl),
    })

    const pools: RacePool[] = []

    // Fetch pool info for each position
    for (const positionId of RACE_POSITION_IDS) {
      try {
        // Get pool key from position
        const [poolKey] = await client.readContract({
          address: V4_POSITION_MANAGER as Address,
          abi: V4_NFT_ABI,
          functionName: 'getPoolAndPositionInfo',
          args: [BigInt(positionId)],
        })

        const { currency0, currency1, fee, tickSpacing, hooks } = poolKey as any

        // Calculate pool ID
        const poolId = calculatePoolId({
          currency0,
          currency1,
          fee: Number(fee),
          tickSpacing: Number(tickSpacing),
          hooks,
        })

        // Get token info
        const [symbol0, symbol1, decimals0, decimals1] = await Promise.all([
          getTokenSymbol(client, currency0),
          getTokenSymbol(client, currency1),
          getTokenDecimals(client, currency0),
          getTokenDecimals(client, currency1),
        ])

        // Try on-chain volume first, fall back to GeckoTerminal
        let volumeUsd = 0
        let swapCount = 0
        let volumeSource: 'on-chain' | 'gecko' | 'unavailable' = 'unavailable'

        try {
          const onChainResult = await getPoolVolume24h(
            logsClient,
            poolId,
            { address: currency0, decimals: decimals0 },
            { address: currency1, decimals: decimals1 }
          )
          volumeUsd = onChainResult.volumeUsd
          swapCount = onChainResult.swapCount
          volumeSource = 'on-chain'
          console.log(`[Race] ${symbol0}/${symbol1}: $${volumeUsd.toFixed(2)} (${swapCount} swaps) [on-chain]`)
        } catch (onChainError) {
          console.log(`[Race] On-chain failed for ${symbol0}/${symbol1}, trying GeckoTerminal...`)
          // Fallback to GeckoTerminal
          const geckoResult = await getGeckoTerminalVolume(currency0, currency1)
          volumeUsd = geckoResult.volume
          volumeSource = 'gecko'
          console.log(`[Race] ${symbol0}/${symbol1}: $${volumeUsd.toFixed(2)} [gecko fallback]`)
        }

        pools.push({
          positionId,
          token0: { symbol: symbol0, address: currency0, decimals: decimals0 },
          token1: { symbol: symbol1, address: currency1, decimals: decimals1 },
          fee: Number(fee),
          volume24h: volumeUsd,
          swapCount24h: swapCount,
          poolId,
          rank: 0,
          volumeSource,
        })
      } catch (err) {
        console.error(`Failed to fetch position ${positionId}:`, err)
      }
    }

    // Sort by 24h volume and assign ranks
    pools.sort((a, b) => b.volume24h - a.volume24h)
    pools.forEach((pool, index) => {
      pool.rank = index + 1
    })

    // Determine overall source
    const onChainCount = pools.filter(p => p.volumeSource === 'on-chain').length
    const source = onChainCount === pools.length ? 'on-chain' :
                   onChainCount > 0 ? 'mixed' : 'gecko'

    return NextResponse.json({
      pools,
      raceEndTime: RACE_END_TIME,
      lastUpdated: Date.now(),
      metric: 'volume24h',
      source,
    })
  } catch (error: any) {
    console.error('[race-pools] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch race pools' },
      { status: 500 }
    )
  }
}
