/**
 * Position Detail Page - Detailed view of single position
 */

import { store } from '../store';
import { fetchPosition } from '../services/api';
import { formatUsd, formatNumber } from '../utils/format';
import { ROUTES } from '../utils/constants';
import type { Position } from '../utils/types';
import { AppHeader } from '../components/AppHeader';

let currentPosition: Position | null = null;
let isLoading = false;

/**
 * Load position details
 */
async function loadPosition(id: string): Promise<void> {
  const { wallet } = store.getState();

  if (!wallet) {
    console.error('[PositionDetail] No wallet connected');
    store.setState({ error: 'Wallet not connected' });
    return;
  }

  isLoading = true;
  store.setState({ error: null });

  try {
    currentPosition = await fetchPosition(id, wallet);
    isLoading = false;
    // Re-render
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = PositionDetailPage({ id: id });
    }
  } catch (error) {
    console.error('[PositionDetail] Failed to load position:', error);
    isLoading = false;
    store.setState({ error: 'Failed to load position. Please try again.' });
  }
}

/**
 * Render Position Detail page
 */
export function PositionDetailPage(params: Record<string, string>): string {
  const id = params.id;
  const { error } = store.getState();

  if (!id) {
    return `
      <div class="position-detail-page">
        ${AppHeader()}
        <div class="page-subheader">
          <a href="#${ROUTES.MY_POOLS}" class="back-button">← Back to Positions</a>
          <h2>Position Details</h2>
        </div>
        <div class="error-banner">Invalid position ID</div>
      </div>
    `;
  }

  // Trigger data load
  if (!currentPosition && !isLoading) {
    loadPosition(id);
  }

  if (isLoading || !currentPosition) {
    return `
      <div class="position-detail-page">
        ${AppHeader()}
        <div class="page-subheader">
          <a href="#${ROUTES.MY_POOLS}" class="back-button">← Back to Positions</a>
          <h2>Position Details</h2>
        </div>

        <div class="loading-state">
          <div class="spinner"></div>
          <p class="text-secondary">Loading position...</p>
        </div>
      </div>
    `;
  }

  const position = currentPosition;
  const inRangeBadge = position.inRange !== undefined
    ? position.inRange
      ? '<span class="badge badge-success">✓ In Range</span>'
      : '<span class="badge badge-warning">⚠ Out of Range</span>'
    : '';

  return `
    <div class="position-detail-page">
      ${AppHeader()}
      <div class="page-subheader">
        <a href="#${ROUTES.MY_POOLS}" class="back-button">← Back to Positions</a>
        <h2>${position.pair} Position</h2>
      </div>

      ${error ? `<div class="error-banner">${error}</div>` : ''}

      <div class="position-detail-card">
        <div class="detail-header">
          <h2>${position.pair}</h2>
          <span class="position-version text-secondary">${position.version}</span>
        </div>

        <div class="detail-section">
          <h3>Value</h3>
          <div class="detail-stats">
            <div class="stat-large">
              <span class="stat-label text-secondary">Your Liquidity</span>
              <span class="stat-value">${formatUsd(position.liquidityUsd)}</span>
            </div>
            <div class="stat-large">
              <span class="stat-label text-secondary">Uncollected Fees</span>
              <span class="stat-value text-positive">${formatUsd(position.feesEarnedUsd)}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>Position Details</h3>
          <div class="detail-list">
            <div class="detail-item">
              <span class="text-secondary">Liquidity</span>
              <span>${formatNumber(parseFloat(position.liquidity))}</span>
            </div>
          </div>
        </div>

        ${position.priceRangeLow && position.priceRangeHigh ? `
          <div class="detail-section">
            <h3>Price Range</h3>
            <div class="detail-list">
              <div class="detail-item">
                <span class="text-secondary">Min Price</span>
                <span>${position.priceRangeLow}</span>
              </div>
              <div class="detail-item">
                <span class="text-secondary">Max Price</span>
                <span>${position.priceRangeHigh}</span>
              </div>
              <div class="detail-item">
                <span class="text-secondary">Status</span>
                ${inRangeBadge}
              </div>
            </div>
          </div>
        ` : ''}

        <div class="detail-actions">
          <button disabled class="button-secondary">Add Liquidity (Coming Soon)</button>
          <button disabled class="button-secondary">Remove Liquidity (Coming Soon)</button>
          <button disabled class="button-secondary">Collect Fees (Coming Soon)</button>
        </div>
      </div>
    </div>
  `;
}
