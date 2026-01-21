'use client'

import { useEffect, useState } from 'react'
import { useAppState } from '@/store/AppContext'
import { useWallet } from '@/hooks/useWallet'
import { fetchPositions, buildCollectFeesTransaction } from '@/services/api'
import { truncateAddress } from '@/utils/format'
import type { Position } from '@/utils/types'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import PositionCard from '@/components/PositionCard'
import Link from 'next/link'
import sdk from '@farcaster/miniapp-sdk'

const POSITIONS_PER_PAGE = 10

export default function MyPoolsPage() {
  const { state, setState } = useAppState()
  const { positions, loading, error } = state
  const wallet = useWallet()
  const [currentPage, setCurrentPage] = useState(1)
  const [collectingFees, setCollectingFees] = useState<string | null>(null)

  useEffect(() => {
    if (wallet && positions.length === 0 && !loading) {
      loadPositions()
    }
  }, [wallet])

  async function loadPositions() {
    if (!wallet) return
    const walletAddress = wallet
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
      console.log('[Positions] Building collect fees transaction')

      const transaction = await buildCollectFeesTransaction(positionId, wallet)
      const provider = await sdk.wallet.getEthereumProvider()

      if (!provider) {
        throw new Error('No Ethereum provider available')
      }

      console.log('[Positions] Sending transaction')
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet as `0x${string}`,
          to: transaction.to as `0x${string}`,
          data: transaction.data as `0x${string}`,
          value: transaction.value as `0x${string}`,
        }],
      })

      console.log('[Positions] Transaction sent:', txHash)

      // Wait and reload
      setTimeout(async () => {
        await loadPositions()
        alert('Fees collected successfully!')
        setCollectingFees(null)
      }, 3000)

    } catch (err) {
      console.error('[Positions] Failed to collect fees:', err)
      alert(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
          <Link href="/" className="back-button">← Back</Link>
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
        <Link href="/" className="back-button">← Back</Link>
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
          <Link href="/" className="button-secondary">Explore Pools</Link>
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
              <PositionCard
                key={position.id}
                position={position}
                onCollectFees={handleCollectFees}
                collectingFees={collectingFees === position.id}
              />
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

      <Footer />
    </div>
  )
}
