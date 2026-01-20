/**
 * Home Page - Primary ARBME pools
 */

import { store } from '../store';
import { fetchPools } from '../services/api';
import { formatUsd, formatPrice, formatChange } from '../utils/format';
import { PRIMARY_POOLS, ROUTES } from '../utils/constants';
import type { Pool } from '../utils/types';

/**
 * Load pools data
 */
async function loadPools(): Promise<void> {
  store.setState({ loading: true, error: null });

  try {
    const data = await fetchPools();
    store.setState({ pools: data.pools, loading: false });
  } catch (error) {
    console.error('[Home] Failed to load pools:', error);
    store.setState({
      error: 'Failed to load pools. Please try again.',
      loading: false,
    });
  }
}

/**
 * Find primary pools from loaded data
 */
function getPrimaryPools(): { weth: Pool | null; clanker: Pool | null } {
  const { pools } = store.getState();

  const weth = pools.find((p) =>
    p.pair.toUpperCase().includes(PRIMARY_POOLS.ARBME_WETH)
  ) || null;

  const clanker = pools.find((p) =>
    p.pair.toUpperCase().includes(PRIMARY_POOLS.ARBME_CLANKER)
  ) || null;

  return { weth, clanker };
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
  const { loading, error } = store.getState();

  // Trigger data load
  if (!loading && store.getState().pools.length === 0) {
    loadPools();
  }

  const { weth, clanker } = getPrimaryPools();

  return `
    <div class="home-page">
      <header class="page-header">
        <h1>ArbMe</h1>
        <p class="text-secondary">Primary Liquidity Pools</p>
      </header>

      ${error ? `<div class="error-banner">${error}</div>` : ''}

      <div class="pools-grid">
        ${PoolCard(weth)}
        ${PoolCard(clanker)}
      </div>

      <div class="home-actions">
        <a href="#${ROUTES.MY_POOLS}" class="button-secondary">My Positions</a>
      </div>
    </div>
  `;
}
