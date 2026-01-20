/**
 * Shared App Header Component
 */

import { store } from '../store';
import { formatArbmeMarketCap, formatUsd, formatPrice } from '../utils/format';

export function AppHeader(): string {
  const { globalStats } = store.getState();

  const marketCapDisplay = globalStats
    ? formatArbmeMarketCap(globalStats.arbmePrice)
    : '...';

  const tvlDisplay = globalStats
    ? formatUsd(globalStats.totalTvl)
    : '...';

  const priceDisplay = globalStats
    ? formatPrice(globalStats.arbmePrice)
    : '...';

  return `
    <header class="app-header">
      <div class="app-header-top">
        <div class="app-logo">
          <img src="/arbie.png" alt="ArbMe" class="logo-image" />
          <div>
            <h1>ArbMe</h1>
            <p class="text-secondary">Permissionless Arb Routes</p>
          </div>
        </div>
        <button id="tip-jar-btn" class="tip-jar-button" title="Send 1 $ARBME tip">
          💝
        </button>
      </div>

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

      <div class="arbme-price-display">
        <span class="price-label text-secondary">$ARBME Price</span>
        <span class="price-value">${priceDisplay}</span>
        <button id="buy-arbme-btn" class="buy-arbme-btn">Buy $ARBME</button>
      </div>
    </header>
  `;
}
