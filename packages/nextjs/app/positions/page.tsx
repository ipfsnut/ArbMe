'use client'

import { useEffect, useState } from 'react'
import { useAppState } from '@/store/AppContext'
import { fetchPositions } from '@/services/api'
import { formatUsd, truncateAddress } from '@/utils/format'
import { collectFees } from '@/lib/actions'
import { getWalletAddress } from '@/lib/wallet'
import type { Position } from '@/utils/types'
import { AppHeader } from '@/components/AppHeader'
import Link from 'next/link'

const POSITIONS_PER_PAGE = 10

export default function MyPoolsPage() {
  const { state, setState } = useAppState()
  const { wallet, positions, loading, error } = state
  const [currentPage, setCurrentPage] = useState(1)
  const [collectingFees, setCollectingFees] = useState<string | null>(null)

  useEffect(() => {
    loadWalletAndPositions()
  }, [])

  async function loadWalletAndPositions() {
    // Get wallet if not already set
    if (!wallet) {
      const address = await getWalletAddress()
      if (address) {
        setState({ wallet: address })
        await loadPositions(address)
      }
    } else if (positions.length === 0 && !loading) {
      await loadPositions(wallet)
    }
  }

  async function loadPositions(walletAddress: string) {
    console.log('[MyPools] Fetching positions for wallet:', walletAddress)
    setState({ loading: true, error: null })

    try {
      const data = await fetchPositions(walletAddress)
      console.log('[MyPools] Received positions:', data)
      setState({ positions: data, loading: false })
    } catch (err) {
      console.error('[MyPools] Failed to load positions:', err)
      setState({
        error: 'Failed to load positions. Please try again.',
        loading: false,
      })
    }
  }

  async function handleCollectFees(positionId: string) {
    if (!wallet) {
      alert('Wallet not connected')
      return
    }

    setCollectingFees(positionId)

    try {
      await collectFees(positionId, wallet)

      // Wait a moment for transaction to confirm, then reload
      setTimeout(() => {
        loadPositions(wallet)
        setCollectingFees(null)
      }, 3000)
    } catch (err) {
      console.error('[MyPools] Failed to collect fees:', err)
      setCollectingFees(null)
    }
  }

  // Calculate pagination
  const totalPages = Math.ceil(positions.length / POSITIONS_PER_PAGE)
  const startIndex = (currentPage - 1) * POSITIONS_PER_PAGE
  const endIndex = startIndex + POSITIONS_PER_PAGE
  const paginatedPositions = positions.slice(startIndex, endIndex)

  function handlePrevPage() {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  function handleNextPage() {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  if (!wallet) {
    return (
      <div className="my-pools-page">
        <AppHeader />

        <div className="page-subheader">
          <Link href="/app" className="back-button">← Back</Link>
          <h2>My Positions</h2>
        </div>

        <div className="empty-state">
          <p className="text-secondary">Wallet not connected</p>
          <p className="text-muted">Connect your Farcaster wallet to view positions</p>
        </div>
      </div>
    )
  }

  return (
    <div className="my-pools-page">
      <AppHeader />

      <div className="page-subheader">
        <Link href="/app" className="back-button">← Back</Link>
        <h2>My Positions</h2>
      </div>

      <div className="wallet-info">
        <span className="text-secondary">Connected:</span>
        <code>{truncateAddress(wallet)}</code>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p className="text-secondary">Loading positions...</p>
        </div>
      )}

      {!loading && positions.length === 0 && (
        <div className="empty-state">
          <p className="text-secondary">No positions found</p>
          <p className="text-muted">Add liquidity to get started</p>
          <Link href="/app" className="button-secondary">Explore Pools</Link>
        </div>
      )}

      {!loading && positions.length > 0 && (
        <>
          <div className="positions-header">
            <p className="text-secondary">
              {positions.length} position{positions.length !== 1 ? 's' : ''} found
            </p>
          </div>

          <div className="positions-list">
            {paginatedPositions.map((position) => (
              <div key={position.id} className="position-card-container">
                <Link href={`/app/position/${position.id}`} className="position-card">
                  <div className="position-header">
                    <h3>{position.pair}</h3>
                    <span className="position-version text-secondary">{position.version}</span>
                  </div>

                  <div className="position-stats">
                    <div className="stat">
                      <span className="stat-label text-secondary">Liquidity</span>
                      <span className="stat-value">{formatUsd(position.liquidityUsd)}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label text-secondary">Uncollected Fees</span>
                      <span className="stat-value text-positive">{formatUsd(position.feesEarnedUsd)}</span>
                    </div>
                  </div>

                  {position.inRange !== undefined && (
                    <span className={`badge ${position.inRange ? 'badge-success' : 'badge-warning'}`}>
                      {position.inRange ? 'In Range' : 'Out of Range'}
                    </span>
                  )}

                  <div className="position-arrow">→</div>
                </Link>

                <button
                  className="collect-fees-btn"
                  onClick={() => handleCollectFees(position.id)}
                  disabled={position.feesEarnedUsd === 0 || collectingFees === position.id}
                >
                  {collectingFees === position.id ? 'Collecting...' : 'Collect Fees'}
                </button>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination-btn"
                onClick={handlePrevPage}
                disabled={currentPage === 1}
              >
                ← Previous
              </button>
              <span className="pagination-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="pagination-btn"
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
