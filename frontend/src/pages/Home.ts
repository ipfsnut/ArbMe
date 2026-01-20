/**
 * Home Page - Featured ARBME pools
 */

import { store } from '../store';
import { fetchPools } from '../services/api';
import { formatUsd, formatPrice, formatChange, formatArbmeMarketCap } from '../utils/format';
import { FEATURED_POOLS, ROUTES, type FeaturedPoolConfig } from '../utils/constants';
import type { Pool } from '../utils/types';

/**
 * Load pools data
 */
async function loadPools(): Promise<void> {
  store.setState({ loading: true, error: null });

  try {
    const data = await fetchPools();
    store.setState({
      pools: data.pools,
      globalStats: {
        arbmePrice: data.arbmePrice,
        totalTvl: data.totalTvl,
      },
      loading: false
    });
  } catch (error) {
    console.error('[Home] Failed to load pools:', error);
    store.setState({
      error: 'Failed to load pools. Please try again.',
      loading: false,
    });
  }
}

/**
 * Check if a pool matches a featured pool config by token addresses.
 * Matches both orderings (token0/token1 can be swapped).
 */
function matchesTokenPair(pool: Pool, config: FeaturedPoolConfig): boolean {
  if (!pool.token0 || !pool.token1) return false;

  const p0 = pool.token0.toLowerCase();
  const p1 = pool.token1.toLowerCase();
  const c0 = config.token0Address.toLowerCase();
  const c1 = config.token1Address.toLowerCase();

  return (p0 === c0 && p1 === c1) || (p0 === c1 && p1 === c0);
}

/**
 * Find featured pools from loaded data.
 * Returns pools sorted by priority (as defined in FEATURED_POOLS config).
 */
function getFeaturedPools(): Pool[] {
  const { pools } = store.getState();
  const featuredPools: Pool[] = [];

  // Find matching pools for each featured pool config
  for (const config of FEATURED_POOLS) {
    const match = pools.find(p => matchesTokenPair(p, config));
    if (match) {
      featuredPools.push(match);
    }
  }

  // Sort by priority from config
  return featuredPools.sort((a, b) => {
    const aConfig = FEATURED_POOLS.find(c => matchesTokenPair(a, c));
    const bConfig = FEATURED_POOLS.find(c => matchesTokenPair(b, c));
    return (aConfig?.priority || 999) - (bConfig?.priority || 999);
  });
}

/**
 * Render a pool card
 */
function PoolCard(pool: Pool | null): string {
  if (!pool) {
    return `
      <div class="pool-card loading">
        <div class="spinner"></div>
        <p class="text-secondary">Loading pool...</p>
      </div>
    `;
  }

  const changeClass = pool.priceChange24h >= 0 ? 'text-positive' : 'text-negative';

  return `
    <div class="pool-card">
      <div class="pool-header">
        <h3>${pool.pair}</h3>
        <span class="pool-dex text-secondary">${pool.dex}</span>
      </div>

      <div class="pool-price">
        <span class="price-value">${formatPrice(pool.priceUsd)}</span>
        <span class="price-change ${changeClass}">${formatChange(pool.priceChange24h)}</span>
      </div>

      <div class="pool-stats">
        <div class="stat">
          <span class="stat-label text-secondary">TVL</span>
          <span class="stat-value">${formatUsd(pool.tvl)}</span>
        </div>
        <div class="stat">
          <span class="stat-label text-secondary">24h Volume</span>
          <span class="stat-value">${formatUsd(pool.volume24h)}</span>
        </div>
      </div>

      <a href="${pool.url}" target="_blank" class="pool-link">
        View on DexScreener →
      </a>
    </div>
  `;
}

/**
 * Render Home page
 */
export function HomePage(_params: Record<string, string>): string {
  const { loading, error, globalStats } = store.getState();

  // Trigger data load
  if (!loading && store.getState().pools.length === 0) {
    loadPools();
  }

  const featuredPools = getFeaturedPools();

  // Format ARBME market cap (price × 100B supply)
  const marketCapDisplay = globalStats
    ? formatArbmeMarketCap(globalStats.arbmePrice)
    : '...';

  const tvlDisplay = globalStats
    ? formatUsd(globalStats.totalTvl)
    : '...';

  // Render pool cards - show loading placeholders if no pools yet
  const poolCards = featuredPools.length > 0
    ? featuredPools.map(pool => PoolCard(pool)).join('')
    : FEATURED_POOLS.map(() => PoolCard(null)).join('');

  return `
    <div class="home-page">
      <header class="page-header">
        <div>
          <h1>ArbMe</h1>
          <p class="text-secondary">Permissionless Arb Routes</p>
        </div>
        <button id="tip-jar-btn" class="tip-jar-button" title="Send 1 $ARBME tip">
          💝
        </button>
      </header>

      <div class="stats-banner">
        <div class="stat-item">
          <span class="stat-label text-secondary">Market Cap</span>
          <span class="stat-value text-accent">${marketCapDisplay}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label text-secondary">Total TVL</span>
          <span class="stat-value">${tvlDisplay}</span>
        </div>
      </div>

      ${error ? `<div class="error-banner">${error}</div>` : ''}

      <div class="pools-grid">
        ${poolCards}
      </div>

      <div class="home-actions">
        <button id="buy-arbme-btn" class="button-primary">Buy $ARBME</button>
        ${store.getState().wallet ? `
          <a href="#${ROUTES.MY_POOLS}" class="button-secondary">My Positions</a>
        ` : ''}
      </div>
    </div>
  `;
}
