/**
 * Application constants
 */

export const ARBME_ADDRESS = '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07';
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
export const CLANKER_ADDRESS = '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb';

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

export const API_BASE = import.meta.env.VITE_API_URL || 'https://arbme.epicdylan.com';

export const ROUTES = {
  HOME: '/',
  MY_POOLS: '/positions',
  POSITION_DETAIL: '/position',
} as const;
