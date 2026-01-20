// Contract addresses (Base mainnet)
export const CONTRACTS = {
  // V2
  V2_ROUTER: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
  V2_FACTORY: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',

  // V3
  V3_POSITION_MANAGER: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
  V3_SWAP_ROUTER: '0x2626664c2603336E57B271c5C0b26F421741e481',

  // V4
  STATE_VIEW: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
  POOL_MANAGER: '0x498581ff718922c3f8e6a244956af099b2652b2b',
  V4_POSITION_MANAGER: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',

  // Shared
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  WETH: '0x4200000000000000000000000000000000000006',
} as const

// Function selectors
export const SELECTORS = {
  // ERC20
  approve: '0x095ea7b3',
  balanceOf: '0x70a08231',
  allowance: '0xdd62ed3e',
  decimals: '0x313ce567',

  // Permit2
  permit2Approve: '0x87517c45', // approve(address,address,uint160,uint48)

  // V4 Position Manager
  modifyLiquidities: '0xdd46508f',
  initializePool: '0x3b1daa78',
  multicall: '0xac9650d8',
} as const

// V4 fee tiers
export const V4_FEE_TIERS = {
  LOWEST: 100,    // 0.01%
  LOW: 500,       // 0.05%
  MEDIUM: 3000,   // 0.30%
  HIGH: 10000,    // 1.00%
  VERY_HIGH: 30000, // 3.00%
  EXTREME: 50000, // 5.00%
} as const

// Fee to tick spacing mapping
export const V4_TICK_SPACINGS: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
  30000: 200,
  50000: 200,
}

export function getV4TickSpacing(fee: number): number {
  return V4_TICK_SPACINGS[fee] ?? 200
}

// Full range tick bounds
export const FULL_RANGE_TICK_LOWER = -887200
export const FULL_RANGE_TICK_UPPER = 887200

// Max uint values for approvals
export const MAX_UINT160 = (BigInt(2) ** BigInt(160) - BigInt(1)).toString(16).padStart(40, '0')
export const MAX_UINT256 = '0x' + 'f'.repeat(64)
export const FAR_FUTURE_EXPIRATION = '0000000000000000000000000000000000000000000000000000ffffffffffff'

// Gas limits
export const GAS_LIMITS = {
  APPROVE: '0x15F90', // 90,000
  ADD_LIQUIDITY: '0x7A120', // 500,000
  REMOVE_LIQUIDITY: '0x7A120',
  INIT_POOL: '0xF4240', // 1,000,000
}

// Token metadata
export interface TokenMetadata {
  address: string
  symbol: string
  decimals: number
  name?: string
  icon?: string
  color?: string
}

export const KNOWN_TOKENS: Record<string, TokenMetadata> = {
  ARBME: {
    address: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07',
    symbol: 'ARBME',
    decimals: 18,
    icon: 'https://arbme.epicdylan.com/arbie.png',
    color: '#10b981',
  },
  USDC: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6,
    icon: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    color: '#2775ca',
  },
  WETH: {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    decimals: 18,
    icon: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    color: '#627eea',
  },
  PAGE: {
    address: '0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE',
    symbol: 'PAGE',
    decimals: 8,
    icon: 'https://arbme.epicdylan.com/pagedaologo.png',
    color: '#ff6b35',
  },
  OINC: {
    address: '0x59e058780dd8a6017061596a62288b6438edbe68',
    symbol: 'OINC',
    decimals: 18,
    color: '#ff69b4',
  },
  cbBTC: {
    address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    symbol: 'cbBTC',
    decimals: 8,
    icon: 'https://assets.coingecko.com/coins/images/40143/small/cbbtc.webp',
    color: '#f7931a',
  },
  CLANKER: {
    address: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb',
    symbol: 'CLANKER',
    decimals: 18,
    color: '#7a7a8f',
  },
}

// Create lookup by address
export const TOKEN_BY_ADDRESS: Record<string, TokenMetadata> = Object.fromEntries(
  Object.values(KNOWN_TOKENS).map(t => [t.address.toLowerCase(), t])
)

export function getTokenByAddress(address: string): TokenMetadata | null {
  return TOKEN_BY_ADDRESS[address.toLowerCase()] ?? null
}

export function getTokenSymbol(address: string): string {
  const token = getTokenByAddress(address)
  if (token) return token.symbol
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function getTokenDecimals(address: string): number | null {
  const token = getTokenByAddress(address)
  return token?.decimals ?? null
}
