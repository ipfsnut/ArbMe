/**
 * ArbMe Pools Widget
 * A reusable, configurable pools display component
 *
 * Usage:
 *   const widget = new PoolsWidget({
 *     container: '#pools-container',
 *     apiUrl: '/pools',
 *     limit: 5,              // Optional: limit number of pools shown
 *     showPrices: true,      // Optional: show individual token prices
 *     autoRefresh: true,     // Optional: auto-refresh data
 *     refreshInterval: 60000 // Optional: refresh interval in ms
 *   });
 *   widget.init();
 */

class PoolsWidget {
  constructor(options = {}) {
    this.container = options.container || '#pools-container';
    this.apiUrl = options.apiUrl || '/pools';
    this.limit = options.limit || null; // null = show all
    this.showPrices = options.showPrices !== false;
    this.autoRefresh = options.autoRefresh !== false;
    this.refreshInterval = options.refreshInterval || 60000;
    this.onDataLoaded = options.onDataLoaded || null;

    this.data = null;
    this.refreshTimer = null;
    this.isLoading = false;
  }

  // Format USD values
  formatUsd(value) {
    if (value === null || value === undefined) return '-';
    if (value >= 1000000) return '$' + (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return '$' + (value / 1000).toFixed(2) + 'K';
    if (value >= 1) return '$' + value.toFixed(2);
    if (value >= 0.01) return '$' + value.toFixed(4);
    return '$' + value.toFixed(6);
  }

  // Format price with appropriate decimals
  formatPrice(value) {
    if (value === null || value === undefined) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    if (num >= 1000) return '$' + num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (num >= 1) return '$' + num.toFixed(4);
    if (num >= 0.0001) return '$' + num.toFixed(6);
    return '$' + num.toFixed(8);
  }

  // Format DEX name
  formatDex(dexId) {
    const dexNames = {
      'uniswap': 'Uniswap',
      'uniswap_v2': 'Uniswap V2',
      'uniswap_v3': 'Uniswap V3',
      'uniswap_v4': 'Uniswap V4',
      'aerodrome': 'Aerodrome',
    };
    return dexNames[dexId] || dexId;
  }

  // Format percentage change
  formatChange(value) {
    if (value === null || value === undefined) return '';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  // Get token price from data - uses prices from API
  getTokenPrice(symbol, data) {
    if (!data) return null;

    const symbolUpper = symbol?.toUpperCase();

    // Check tokenPrices object from API
    if (data.tokenPrices) {
      if (symbolUpper === 'PAGE' && data.tokenPrices.PAGE) return data.tokenPrices.PAGE;
      if (symbolUpper === 'OINC' && data.tokenPrices.OINC) return data.tokenPrices.OINC;
      if (symbolUpper === 'CLANKER' && data.tokenPrices.CLANKER) return data.tokenPrices.CLANKER;
      if ((symbolUpper === 'WETH' || symbolUpper === 'ETH') && data.tokenPrices.WETH) {
        return data.tokenPrices.WETH;
      }
    }

    // ARBME price
    if (symbolUpper === 'ARBME' || symbolUpper === '$ARBME') {
      return data.arbmePrice ? parseFloat(data.arbmePrice) : null;
    }

    // Return null for tokens we don't have price data for
    return null;
  }

  // Parse pair string to get token symbols
  parseTokensFromPair(pair) {
    if (!pair) return { token0: null, token1: null };
    const parts = pair.split('/');
    return {
      token0: parts[0]?.trim() || null,
      token1: parts[1]?.trim() || null
    };
  }

  // Fetch pools data
  async fetchData() {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const response = await fetch(this.apiUrl);
      if (!response.ok) throw new Error('API error: ' + response.status);
      this.data = await response.json();

      if (this.onDataLoaded) {
        this.onDataLoaded(this.data);
      }

      return this.data;
    } catch (error) {
      console.error('[PoolsWidget] Failed to fetch pools:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  // Render loading state
  renderLoading() {
    const el = document.querySelector(this.container);
    if (!el) return;
    el.innerHTML = '<div class="pools-widget-loading">Loading pools...</div>';
  }

  // Render error state
  renderError(message) {
    const el = document.querySelector(this.container);
    if (!el) return;
    el.innerHTML = `<div class="pools-widget-error">${message}</div>`;
  }

  // Render pools table
  render() {
    const el = document.querySelector(this.container);
    if (!el || !this.data) return;

    const pools = this.limit
      ? this.data.pools.slice(0, this.limit)
      : this.data.pools;

    if (!pools || pools.length === 0) {
      el.innerHTML = '<div class="pools-widget-empty">No pools found yet. Be the first to LP!</div>';
      return;
    }

    let html = `
      <table class="pools-widget-table">
        <thead>
          <tr>
            <th>Pair</th>
            <th>DEX</th>
            ${this.showPrices ? '<th>Token Prices</th>' : ''}
            <th>TVL</th>
            <th>24h Vol</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const pool of pools) {
      const tokens = this.parseTokensFromPair(pool.pair);
      const token0Price = this.getTokenPrice(tokens.token0, this.data);
      const token1Price = this.getTokenPrice(tokens.token1, this.data);
      const changeClass = pool.priceChange24h >= 0 ? 'positive' : 'negative';

      html += `
        <tr>
          <td>
            <div class="pools-widget-pair">${pool.pair}</div>
            ${pool.priceChange24h !== undefined ?
              `<div class="pools-widget-change ${changeClass}">${this.formatChange(pool.priceChange24h)}</div>`
              : ''}
          </td>
          <td class="pools-widget-dex">${this.formatDex(pool.dex)}</td>
          ${this.showPrices ? `
            <td class="pools-widget-prices">
              <span class="token-price">${tokens.token0}: ${token0Price !== null ? this.formatPrice(token0Price) : '-'}</span>
              <span class="token-price">${tokens.token1}: ${token1Price !== null ? this.formatPrice(token1Price) : '-'}</span>
            </td>
          ` : ''}
          <td class="pools-widget-tvl">${this.formatUsd(pool.tvl)}</td>
          <td class="pools-widget-volume">${this.formatUsd(pool.volume24h)}</td>
          <td><a href="${pool.url}" target="_blank" rel="noopener" class="pools-widget-link">View</a></td>
        </tr>
      `;
    }

    html += '</tbody></table>';

    // Add last updated info
    if (this.data.lastUpdated) {
      html += `<div class="pools-widget-updated">Last updated: ${new Date(this.data.lastUpdated).toLocaleTimeString()}</div>`;
    }

    el.innerHTML = html;
  }

  // Start auto-refresh
  startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      try {
        await this.fetchData();
        this.render();
      } catch (error) {
        console.error('[PoolsWidget] Auto-refresh failed:', error);
      }
    }, this.refreshInterval);
  }

  // Stop auto-refresh
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // Initialize the widget
  async init() {
    this.renderLoading();

    try {
      await this.fetchData();
      this.render();

      if (this.autoRefresh) {
        this.startAutoRefresh();
      }
    } catch (error) {
      this.renderError('Failed to load pools. Please refresh the page.');
    }
  }

  // Manual refresh
  async refresh() {
    try {
      await this.fetchData();
      this.render();
    } catch (error) {
      console.error('[PoolsWidget] Refresh failed:', error);
    }
  }

  // Destroy the widget
  destroy() {
    this.stopAutoRefresh();
    const el = document.querySelector(this.container);
    if (el) el.innerHTML = '';
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PoolsWidget;
}
