/**
 * Featured Pools Configuration - Single Source of Truth
 *
 * Defines the featured ARBME pools to be highlighted across the application.
 * This centralized config eliminates fragile string matching and hardcoded pools.
 */

import { TOKEN_METADATA } from './tokens';

const { ARBME, WETH, CLANKER } = TOKEN_METADATA;

// ═══════════════════════════════════════════════════════════════════════════════
// Featured Pool Configuration Interface
// ═══════════════════════════════════════════════════════════════════════════════

export interface FeaturedPoolConfig {
  id: string;                    // Unique identifier (e.g., 'arbme-weth', 'clanker-arbme')
  displayName: string;           // Display name for UI (e.g., 'ARBME / WETH')
  priority: number;              // Display order (1 = first, 2 = second, etc.)
  token0Address: string;         // First token address (for reliable matching)
  token1Address: string;         // Second token address (for reliable matching)
  token0Symbol: string;          // First token symbol
  token1Symbol: string;          // Second token symbol
  v4PoolId?: string;            // V4 pool ID if exists
  poolAddresses?: {             // V2/V3 addresses if exist
    v2?: string;
    v3?: string;
  };
  fee?: number;                 // Fee tier in basis points
  alwaysShow?: boolean;         // Show even if TVL is low
}

// ═══════════════════════════════════════════════════════════════════════════════
// Featured Pools Array - THE SINGLE SOURCE OF TRUTH
// ═══════════════════════════════════════════════════════════════════════════════

export const FEATURED_POOLS: FeaturedPoolConfig[] = [
  {
    id: 'arbme-weth',
    displayName: 'ARBME / WETH',
    priority: 1,
    token0Address: ARBME.address,
    token1Address: WETH.address,
    token0Symbol: 'ARBME',
    token1Symbol: 'WETH',
    alwaysShow: true,
    // Pool created when ARBME was deployed
  },
  {
    id: 'clanker-arbme',
    displayName: 'CLANKER / ARBME',
    priority: 2,
    token0Address: CLANKER.address,
    token1Address: ARBME.address,
    token0Symbol: 'CLANKER',
    token1Symbol: 'ARBME',
    v4PoolId: '0x10830495714f0463b22fddb2e329e372f3ff86a865f01237cd98e4fc8770311a',
    poolAddresses: {
      v2: '0x14aeb8cfdf477001a60f5196ec2ddfe94771b794',
    },
    fee: 30000, // 3%
    alwaysShow: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a pool matches a featured pool configuration.
 * Matches by token addresses (both orderings).
 *
 * @param pool - Pool object with token0 and token1 addresses
 * @param config - Featured pool configuration
 * @returns true if the pool matches the config
 */
export function matchesFeaturedPool(
  pool: { token0?: string; token1?: string },
  config: FeaturedPoolConfig
): boolean {
  if (!pool.token0 || !pool.token1) return false;

  const p0 = pool.token0.toLowerCase();
  const p1 = pool.token1.toLowerCase();
  const c0 = config.token0Address.toLowerCase();
  const c1 = config.token1Address.toLowerCase();

  // Match both orderings (token0/token1 can be swapped)
  return (p0 === c0 && p1 === c1) || (p0 === c1 && p1 === c0);
}

/**
 * Find the matching featured pool configuration for a given pool.
 *
 * @param pool - Pool object with token0 and token1 addresses
 * @returns Matching FeaturedPoolConfig or null if not a featured pool
 */
export function findMatchingFeaturedPool(
  pool: { token0?: string; token1?: string }
): FeaturedPoolConfig | null {
  return FEATURED_POOLS.find(config => matchesFeaturedPool(pool, config)) || null;
}

/**
 * Get all featured pools sorted by priority.
 *
 * @returns Array of featured pools sorted by priority (lowest priority number first)
 */
export function getFeaturedPoolsSorted(): FeaturedPoolConfig[] {
  return [...FEATURED_POOLS].sort((a, b) => a.priority - b.priority);
}
