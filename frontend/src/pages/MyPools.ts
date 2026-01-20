/**
 * My Pools Page - User's LP positions
 */

import { store } from '../store';
import { fetchPositions, buildCollectFeesTransaction } from '../services/api';
import { formatUsd, truncateAddress } from '../utils/format';
import { ROUTES } from '../utils/constants';
import type { Position } from '../utils/types';
import { AppHeader } from '../components/AppHeader';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Load user positions
 */
async function loadPositions(): Promise<void> {
  const { wallet } = store.getState();

  console.log('[MyPools] loadPositions called, wallet:', wallet);

  if (!wallet) {
    console.log('[MyPools] No wallet connected');
    store.setState({ error: 'Wallet not connected' });
    return;
  }

  console.log('[MyPools] Fetching positions for wallet:', wallet);
  store.setState({ loading: true, error: null });

  try {
    const positions = await fetchPositions(wallet);
    console.log('[MyPools] Received positions:', positions);
    store.setState({ positions, loading: false });
  } catch (error) {
    console.error('[MyPools] Failed to load positions:', error);
    store.setState({
      error: 'Failed to load positions. Please try again.',
      loading: false,
    });
  }
}

/**
 * Collect fees from a position
 */
async function collectFees(positionId: string, buttonElement: HTMLButtonElement): Promise<void> {
  const { wallet } = store.getState();

  if (!wallet) {
    alert('Wallet not connected');
    return;
  }

  try {
    // Disable button and show loading state
    buttonElement.disabled = true;
    buttonElement.textContent = 'Building transaction...';

    console.log('[MyPools] Building collect fees transaction for:', positionId);

    // Build the transaction
    const transaction = await buildCollectFeesTransaction(positionId, wallet);

    console.log('[MyPools] Transaction built:', transaction);

    // Get Ethereum provider
    buttonElement.textContent = 'Awaiting approval...';
    const provider = await sdk.wallet.getEthereumProvider();

    if (!provider) {
      throw new Error('No Ethereum provider available');
    }

    // Send transaction
    console.log('[MyPools] Sending transaction...');
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: wallet as `0x${string}`,
        to: transaction.to as `0x${string}`,
        data: transaction.data as `0x${string}`,
        value: transaction.value as `0x${string}`,
      }],
    });

    console.log('[MyPools] Transaction sent:', txHash);
    buttonElement.textContent = 'Confirming...';

    // Wait a moment for the transaction to potentially confirm
    // Then reload positions to show updated fees
    setTimeout(async () => {
      await loadPositions();
      alert('Fees collected successfully!');
    }, 3000);

  } catch (error) {
    console.error('[MyPools] Failed to collect fees:', error);
    alert(`Failed to collect fees: ${error instanceof Error ? error.message : 'Unknown error'}`);

    // Re-enable button
    buttonElement.disabled = false;
    buttonElement.textContent = 'Collect Fees';
  }
}

/**
 * Render a position card
 */
function PositionCard(position: Position, index: number): string {
  const inRangeBadge = position.inRange !== undefined
    ? position.inRange
      ? '<span class="badge badge-success">In Range</span>'
      : '<span class="badge badge-warning">Out of Range</span>'
    : '';

  return `
    <div class="position-card-container">
      <a href="#${ROUTES.POSITION_DETAIL}/${position.id}" class="position-card">
        <div class="position-header">
          <h3>${position.pair}</h3>
          <span class="position-version text-secondary">${position.version}</span>
        </div>

        <div class="position-stats">
          <div class="stat">
            <span class="stat-label text-secondary">Liquidity</span>
            <span class="stat-value">${formatUsd(position.liquidityUsd)}</span>
          </div>
          <div class="stat">
            <span class="stat-label text-secondary">Uncollected Fees</span>
            <span class="stat-value text-positive">${formatUsd(position.feesEarnedUsd)}</span>
          </div>
        </div>

        ${inRangeBadge}

        <div class="position-arrow">→</div>
      </a>
      <button
        class="collect-fees-btn"
        data-position-id="${position.id}"
        data-position-index="${index}"
        ${position.feesEarnedUsd === 0 ? 'disabled' : ''}
      >
        Collect Fees
      </button>
    </div>
  `;
}

// Pagination state
const POSITIONS_PER_PAGE = 10;
let currentPage = 1;

// Setup pagination event listener
if (typeof window !== 'undefined') {
  window.addEventListener('changePage', ((e: CustomEvent) => {
    const direction = e.detail?.direction;
    if (direction === 'prev' && currentPage > 1) {
      currentPage--;
      store.setState({}); // Trigger rerender
    } else if (direction === 'next') {
      const { positions } = store.getState();
      const totalPages = Math.ceil(positions.length / POSITIONS_PER_PAGE);
      if (currentPage < totalPages) {
        currentPage++;
        store.setState({}); // Trigger rerender
      }
    }
  }) as EventListener);

  // Setup collect fees button listeners after DOM updates
  // We use event delegation on the document since buttons are dynamically rendered
  let collectFeesListenerAttached = false;
  if (!collectFeesListenerAttached) {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('collect-fees-btn')) {
        const button = target as HTMLButtonElement;
        const positionId = button.dataset.positionId;
        if (positionId) {
          collectFees(positionId, button);
        }
      }
    });
    collectFeesListenerAttached = true;
  }
}

/**
 * Render My Pools page
 */
export function MyPoolsPage(_params: Record<string, string>): string {
  const { wallet, positions, loading, error } = store.getState();

  console.log('[MyPools] Rendering page, wallet:', wallet, 'positions:', positions.length, 'loading:', loading);

  // Trigger data load
  if (wallet && !loading && positions.length === 0) {
    console.log('[MyPools] Triggering loadPositions...');
    loadPositions();
  }

  // Calculate pagination
  const totalPages = Math.ceil(positions.length / POSITIONS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSITIONS_PER_PAGE;
  const endIndex = startIndex + POSITIONS_PER_PAGE;
  const paginatedPositions = positions.slice(startIndex, endIndex);

  if (!wallet) {
    return `
      <div class="my-pools-page">
        ${AppHeader()}

        <div class="page-subheader">
          <a href="#${ROUTES.HOME}" class="back-button">← Back</a>
          <h2>My Positions</h2>
        </div>

        <div class="empty-state">
          <p class="text-secondary">Wallet not connected</p>
          <p class="text-muted">Connect your Farcaster wallet to view positions</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="my-pools-page">
      ${AppHeader()}

      <div class="page-subheader">
        <a href="#${ROUTES.HOME}" class="back-button">← Back</a>
        <h2>My Positions</h2>
      </div>

      <div class="wallet-info">
        <span class="text-secondary">Connected:</span>
        <code>${truncateAddress(wallet)}</code>
      </div>

      ${error ? `<div class="error-banner">${error}</div>` : ''}

      ${loading ? `
        <div class="loading-state">
          <div class="spinner"></div>
          <p class="text-secondary">Loading positions...</p>
        </div>
      ` : ''}

      ${!loading && positions.length === 0 ? `
        <div class="empty-state">
          <p class="text-secondary">No positions found</p>
          <p class="text-muted">Add liquidity to get started</p>
          <a href="#${ROUTES.HOME}" class="button-secondary">Explore Pools</a>
        </div>
      ` : ''}

      ${!loading && positions.length > 0 ? `
        <div class="positions-header">
          <p class="text-secondary">${positions.length} position${positions.length !== 1 ? 's' : ''} found</p>
        </div>
        <div class="positions-list">
          ${paginatedPositions.map((pos, idx) => PositionCard(pos, startIndex + idx)).join('')}
        </div>
        ${totalPages > 1 ? `
          <div class="pagination">
            <button
              id="prev-page-btn"
              class="pagination-btn"
              ${currentPage === 1 ? 'disabled' : ''}
            >← Previous</button>
            <span class="pagination-info">Page ${currentPage} of ${totalPages}</span>
            <button
              id="next-page-btn"
              class="pagination-btn"
              ${currentPage === totalPages ? 'disabled' : ''}
            >Next →</button>
          </div>
        ` : ''}
      ` : ''}
    </div>
  `;
}
