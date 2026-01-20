import { API_BASE_URL } from './wagmi'

/**
 * API client for the ArbMe Worker backend
 */

// Types
export interface TokenInfo {
  address: string
  symbol: string
  name: string
  decimals: number
  decimalsVerified: boolean
}

export interface PoolData {
  address: string
  name: string
  dex: string
  token0: string
  token1: string
  token0Symbol: string
  token1Symbol: string
  priceUsd?: number
  volume24h?: number
  liquidity?: number
}

export interface V2Position {
  type: 'V2'
  poolAddress: string
  pair: string
  token0: string
  token1: string
  token0Symbol: string
  token1Symbol: string
  token0Decimals: number
  token1Decimals: number
  lpBalance: number
  sharePercent: number
  token0Amount: number
  token1Amount: number
}

export interface V3Position {
  type: 'V3'
  tokenId: string
  pair: string
  token0: string
  token1: string
  token0Address: string
  token1Address: string
  token0Decimals: number
  token1Decimals: number
  fee: string
  feeRaw: number
  liquidity: string
  tickLower: number
  tickUpper: number
  currentTick: number
  inRange: boolean
  token0Amount: number
  token1Amount: number
  tokensOwed0: number
  tokensOwed1: number
  hasUnclaimedFees: boolean
  isClosed: boolean
  poolShare: number
  poolAddress: string
}

export interface V4Position {
  type: 'V4'
  tokenId: string
  pair: string
  currency0: string
  currency1: string
  token0Symbol: string
  token1Symbol: string
  token0Decimals: number | null
  token1Decimals: number | null
  fee: number
  feePercent: string
  tickSpacing: number
  hooks: string
  tickLower: number
  tickUpper: number
  liquidity: string
  hasLiquidity: boolean
  inRange: boolean
  token0Amount: number
  token1Amount: number
  tokensOwed0: number
  tokensOwed1: number
  hasUnclaimedFees: boolean
  poolShare: number
  poolId: string
}

export type Position = V2Position | V3Position | V4Position

// API functions
async function fetchApi<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE_URL}${endpoint}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json()
}

// Token endpoints
export async function getTokenInfo(address: string): Promise<TokenInfo> {
  return fetchApi('/test/rpc', { action: 'tokenInfo', token: address })
}

export async function getTokenBalance(wallet: string, token: string) {
  return fetchApi('/test/rpc', { action: 'tokenBalance', wallet, token })
}

export async function getWalletTokens(wallet: string) {
  return fetchApi('/test/rpc', { action: 'walletTokens', wallet })
}

// Pool endpoints
export async function getPools(): Promise<{ pools: PoolData[] }> {
  return fetchApi('/pools')
}

export async function getV2Reserves(pairAddress: string) {
  return fetchApi('/test/rpc', { action: 'getReserves', pair: pairAddress })
}

export async function getV4Slot0(params: {
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  hooks?: string
}) {
  return fetchApi('/test/rpc', {
    action: 'v4_getSlot0',
    currency0: params.currency0,
    currency1: params.currency1,
    fee: String(params.fee),
    tickSpacing: String(params.tickSpacing),
    hooks: params.hooks || '0x0000000000000000000000000000000000000000',
  })
}

// Position response types
interface V2PositionsResponse {
  positions?: Omit<V2Position, 'type'>[]
}

interface V3PositionsResponse {
  positions?: Omit<V3Position, 'type'>[]
}

interface V4PositionsResponse {
  positions?: Omit<V4Position, 'type'>[]
}

// Position endpoints
export async function getV2Positions(wallet: string): Promise<V2PositionsResponse> {
  return fetchApi('/test/rpc', { action: 'v2_allPositions', wallet })
}

export async function getV3Positions(wallet: string): Promise<V3PositionsResponse> {
  return fetchApi('/test/rpc', { action: 'v3_allPositions', wallet })
}

export async function getV4Positions(wallet: string): Promise<V4PositionsResponse> {
  return fetchApi('/test/rpc', { action: 'v4_allPositions', wallet })
}

export async function getAllPositions(wallet: string): Promise<Position[]> {
  const [v2Data, v3Data, v4Data] = await Promise.all([
    getV2Positions(wallet),
    getV3Positions(wallet),
    getV4Positions(wallet),
  ])

  const positions: Position[] = []

  // Add V2 positions
  if (v2Data.positions) {
    for (const pos of v2Data.positions) {
      positions.push({
        type: 'V2',
        ...pos,
      })
    }
  }

  // Add V3 positions
  if (v3Data.positions) {
    for (const pos of v3Data.positions) {
      positions.push({
        type: 'V3',
        ...pos,
      })
    }
  }

  // Add V4 positions
  if (v4Data.positions) {
    for (const pos of v4Data.positions) {
      positions.push({
        type: 'V4',
        ...pos,
      })
    }
  }

  return positions
}

// Price endpoints
export async function getTokenPrices(addresses: string[]) {
  return fetchApi('/test/rpc', {
    action: 'tokenPrices',
    tokens: addresses.join(','),
  })
}
