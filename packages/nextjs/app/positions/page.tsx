'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useWallet } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { PositionCard } from '@/components/PositionCard'
import { ROUTES } from '@/utils/constants'
import type { Position } from '@/utils/types'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/app/api'

export default function PositionsPage() {
  const wallet = useWallet()
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => {
    async function fetchPositions() {
      if (!wallet) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`${API_BASE}/positions?wallet=${wallet}`)
        if (!res.ok) {
          throw new Error('Failed to fetch positions')
        }
        const data = await res.json()
        setPositions(data.positions || [])
      } catch (err: any) {
        console.error('[PositionsPage] Error:', err)
        setError(err.message || 'Failed to load positions')
      } finally {
        setLoading(false)
      }
    }

    fetchPositions()
  }, [wallet])

  const activePositions = positions.filter(p =>
    p.liquidityUsd && p.liquidityUsd > 0
  )
  const closedPositions = positions.filter(p =>
    !p.liquidityUsd || p.liquidityUsd === 0
  )

  const displayedPositions = showClosed ? positions : activePositions

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <div className="section-header">
          <h2>
            My Positions
            <span className="count">({activePositions.length})</span>
            {closedPositions.length > 0 && (
              <span className="closed-count">+ {closedPositions.length} closed</span>
            )}
          </h2>
          <div className="header-actions">
            <Link href={ROUTES.ADD_LIQUIDITY} className="btn btn-primary btn-sm">
              + Add
            </Link>
          </div>
        </div>

        {!wallet ? (
          <div className="empty-state">
            <p>Connect your wallet to view positions</p>
            <p className="hint">Your wallet will connect automatically in Farcaster</p>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading positions...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : displayedPositions.length === 0 ? (
          <div className="empty-state">
            <p>No {showClosed ? '' : 'active '}positions found</p>
            <p className="hint">Add liquidity to a pool to get started</p>
            <Link href={ROUTES.ADD_LIQUIDITY} className="btn btn-primary" style={{ marginTop: '1rem' }}>
              Add Liquidity
            </Link>
          </div>
        ) : (
          <>
            {closedPositions.length > 0 && (
              <div className="positions-filter">
                <label className="filter-toggle">
                  <input
                    type="checkbox"
                    checked={showClosed}
                    onChange={(e) => setShowClosed(e.target.checked)}
                  />
                  <span className="filter-label">Show closed positions</span>
                </label>
              </div>
            )}

            <div className="positions-grid">
              {displayedPositions.map((position) => (
                <PositionCard key={position.id} position={position} />
              ))}
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  )
}
