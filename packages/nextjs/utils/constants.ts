/**
 * Application constants
 */

export const ARBME_ADDRESS = '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07';
export const RATCHET_ADDRESS = '0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07';
export const PAGE_ADDRESS = '0xc4730f86d1F86cE0712a7b17EE919Db7deFAD7FE';
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
export const CLANKER_ADDRESS = '0x1bc0c42215582d5A085795f4bADbAc3ff36d1Bcb';

/**
 * Featured pools configuration for the frontend.
 * This is a minimal version of the worker's FEATURED_POOLS config.
 * Matches pools by token addresses instead of fragile string matching.
 */
export interface FeaturedPoolConfig {
  id: string;
  displayName: string;
  priority: number;
  token0Address: string;
  token1Address: string;
}

export const FEATURED_POOLS: FeaturedPoolConfig[] = [
  {
    id: 'arbme-weth',
    displayName: 'ARBME / WETH',
    priority: 1,
    token0Address: ARBME_ADDRESS,
    token1Address: WETH_ADDRESS,
  },
  {
    id: 'clanker-arbme',
    displayName: 'CLANKER / ARBME',
    priority: 2,
    token0Address: CLANKER_ADDRESS,
    token1Address: ARBME_ADDRESS,
  },
];

// Routes
export const ROUTES = {
  LANDING: '/',
  HOME: '/app',
  APP: '/app',
  MY_POOLS: '/positions',
  POSITION_DETAIL: '/positions',
  ADD_LIQUIDITY: '/add-liquidity',
  STAKE: '/stake',
  WRAP: '/wrap',
  TREASURY: '/treasury',
  TRADE: '/trade',
  TRAFFIC: '/traffic',
} as const;

// Position Managers
export const V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';
export const V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
export const V2_ROUTER = '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24';

// V3 only supports these 4 fee tiers (hardcoded in Uniswap V3 contracts)
export const V3_FEE_TIERS = [
  { value: 100, label: '0.01%', description: 'Best for stable pairs' },
  { value: 500, label: '0.05%', description: 'Stable pairs' },
  { value: 3000, label: '0.3%', description: 'Most pairs' },
  { value: 10000, label: '1%', description: 'Exotic pairs' },
] as const;

// V4 allows flexible fee tiers
export const V4_FEE_TIERS = [
  { value: 500, label: '0.05%', description: 'Best for stable pairs' },
  { value: 3000, label: '0.3%', description: 'Best for most pairs' },
  { value: 10000, label: '1%', description: 'Best for exotic pairs' },
  { value: 30000, label: '3%', description: 'High volatility' },
  { value: 50000, label: '5%', description: 'Very high volatility' },
  { value: 100000, label: '10%', description: 'Extreme volatility' },
  { value: 150000, label: '15%', description: 'Ultra volatile' },
  { value: 200000, label: '20%', description: 'Extreme risk' },
  { value: 250000, label: '25%', description: 'Maximum risk' },
  { value: 500000, label: '50%', description: 'Degen mode' },
] as const;

// Legacy export for backwards compatibility (defaults to V4 tiers)
export const FEE_TIERS = V4_FEE_TIERS;
