'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAppState } from '@/store/AppContext'
import { fetchPosition } from '@/services/api'
import { formatUsd } from '@/utils/format'
import { getWalletAddress } from '@/lib/wallet'
import type { Position } from '@/utils/types'
import { AppHeader } from '@/components/AppHeader'
import Link from 'next/link'

export default function PositionDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { state, setState } = useAppState()
  const { wallet, error } = state
  const [position, setPosition] = useState<Position | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadWalletAndPosition()
  }, [id])

  async function loadWalletAndPosition() {
    // Get wallet if not already set
    let walletAddress = wallet
    if (!walletAddress) {
      walletAddress = await getWalletAddress()
      if (walletAddress) {
        setState({ wallet: walletAddress })
      }
    }

    if (walletAddress) {
      await loadPosition(walletAddress)
    } else {
      setState({ error: 'Wallet not connected' })
      setLoading(false)
    }
  }

  async function loadPosition(walletAddress: string) {
    if (!id) {
      setState({ error: 'Invalid position ID' })
      setLoading(false)
      return
    }

    setLoading(true)
    setState({ error: null })

    try {
      console.log('[PositionDetail] Fetching position:', id, 'for wallet:', walletAddress)
      const data = await fetchPosition(id, walletAddress)
      console.log('[PositionDetail] Received position:', data)
      setPosition(data)
      setLoading(false)
    } catch (err) {
      console.error('[PositionDetail] Failed to load position:', err)
      setState({ error: 'Failed to load position. Please try again.' })
      setLoading(false)
    }
  }

  if (!id) {
    return (
      <div className="position-detail-page">
        <AppHeader />
        <div className="page-subheader">
          <Link href="/app/positions" className="back-button">← Back to Positions</Link>
          <h2>Position Details</h2>
        </div>
        <div className="error-banner">Invalid position ID</div>
      </div>
    )
  }

  if (loading || !position) {
    return (
      <div className="position-detail-page">
        <AppHeader />
        <div className="page-subheader">
          <Link href="/app/positions" className="back-button">← Back to Positions</Link>
          <h2>Position Details</h2>
        </div>

        <div className="loading-state">
          <div className="spinner"></div>
          <p className="text-secondary">Loading position...</p>
        </div>
      </div>
    )
  }

  const inRangeBadge = position.inRange !== undefined
    ? position.inRange
      ? <span className="badge badge-success">✓ In Range</span>
      : <span className="badge badge-warning">⚠ Out of Range</span>
    : null

  return (
    <div className="position-detail-page">
      <AppHeader />
      <div className="page-subheader">
        <Link href="/app/positions" className="back-button">← Back to Positions</Link>
        <h2>{position.pair} Position</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="position-detail-card">
        <div className="detail-header">
          <h2>{position.pair}</h2>
          <span className="position-version text-secondary">{position.version}</span>
        </div>

        <div className="detail-section">
          <h3>Value</h3>
          <div className="detail-stats">
            <div className="stat-large">
              <span className="stat-label text-secondary">Your Liquidity</span>
              <span className="stat-value">{formatUsd(position.liquidityUsd)}</span>
            </div>
            <div className="stat-large">
              <span className="stat-label text-secondary">Uncollected Fees</span>
              <span className="stat-value text-positive">{formatUsd(position.feesEarnedUsd)}</span>
            </div>
          </div>
        </div>

        <div className="detail-section">
          <h3>Position Details</h3>
          <div className="detail-list">
            <div className="detail-item">
              <span className="text-secondary">Liquidity</span>
              <span>{position.liquidity}</span>
            </div>
          </div>
        </div>

        {position.priceRangeLow && position.priceRangeHigh && (
          <div className="detail-section">
            <h3>Price Range</h3>
            <div className="detail-list">
              <div className="detail-item">
                <span className="text-secondary">Min Price</span>
                <span>{position.priceRangeLow}</span>
              </div>
              <div className="detail-item">
                <span className="text-secondary">Max Price</span>
                <span>{position.priceRangeHigh}</span>
              </div>
              <div className="detail-item">
                <span className="text-secondary">Status</span>
                {inRangeBadge}
              </div>
            </div>
          </div>
        )}

        <div className="detail-actions">
          <button disabled className="button-secondary">Add Liquidity (Coming Soon)</button>
          <button disabled className="button-secondary">Remove Liquidity (Coming Soon)</button>
          <button disabled className="button-secondary">Collect Fees (Coming Soon)</button>
        </div>
      </div>
    </div>
  )
}
