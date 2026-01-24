'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWallet } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { ROUTES } from '@/utils/constants'
import type { Position } from '@/utils/types'
import sdk from '@farcaster/miniapp-sdk'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/app/api'

type TxStatus = 'idle' | 'building' | 'pending' | 'success' | 'error'

export default function PositionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const wallet = useWallet()
  const positionId = params.id as string

  const [position, setPosition] = useState<Position | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Transaction states
  const [collectStatus, setCollectStatus] = useState<TxStatus>('idle')
  const [removePercentage, setRemovePercentage] = useState(0)
  const [removeStatus, setRemoveStatus] = useState<TxStatus>('idle')
  const [txError, setTxError] = useState<string | null>(null)

  // Modal states
  const [showRemoveModal, setShowRemoveModal] = useState(false)

  const fetchPosition = useCallback(async () => {
    if (!wallet || !positionId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Fetch all positions and find the one we need
      const res = await fetch(`${API_BASE}/positions?wallet=${wallet}`)
      if (!res.ok) {
        throw new Error('Failed to fetch positions')
      }
      const data = await res.json()
      const found = data.positions?.find((p: Position) => p.id === positionId)

      if (!found) {
        throw new Error('Position not found')
      }

      setPosition(found)
    } catch (err: any) {
      console.error('[PositionDetailPage] Error:', err)
      setError(err.message || 'Failed to load position')
    } finally {
      setLoading(false)
    }
  }, [wallet, positionId])

  useEffect(() => {
    fetchPosition()
  }, [fetchPosition])

  const sendTransaction = async (tx: { to: string; data: string; value: string }) => {
    if (!wallet) throw new Error('No wallet connected')

    const provider = await sdk.wallet.getEthereumProvider()
    if (!provider) throw new Error('No wallet provider')

    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: wallet as `0x${string}`,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value !== '0' ? `0x${BigInt(tx.value).toString(16)}` as `0x${string}` : '0x0',
      }],
    })

    return txHash as string
  }

  const handleCollectFees = async () => {
    if (!position || !wallet) return

    try {
      setCollectStatus('building')
      setTxError(null)

      const res = await fetch(`${API_BASE}/collect-fees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: position.id,
          recipient: wallet,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to build transaction')
      }

      const { transaction } = await res.json()

      setCollectStatus('pending')
      await sendTransaction(transaction)
      setCollectStatus('success')

      // Refresh position data
      setTimeout(() => {
        fetchPosition()
        setCollectStatus('idle')
      }, 3000)
    } catch (err: any) {
      console.error('[collectFees] Error:', err)
      setTxError(err.message || 'Transaction failed')
      setCollectStatus('error')
    }
  }

  const handleRemoveLiquidity = async () => {
    if (!position || !wallet || removePercentage === 0) return

    try {
      setRemoveStatus('building')
      setTxError(null)

      const res = await fetch(`${API_BASE}/decrease-liquidity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: position.id,
          liquidityPercentage: removePercentage,
          currentLiquidity: position.liquidity,
          recipient: wallet,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to build transaction')
      }

      const { transaction } = await res.json()

      setRemoveStatus('pending')
      await sendTransaction(transaction)
      setRemoveStatus('success')

      // Refresh and close modal
      setTimeout(() => {
        fetchPosition()
        setRemoveStatus('idle')
        setShowRemoveModal(false)
        setRemovePercentage(0)

        // If 100% removed, go back to list
        if (removePercentage === 100) {
          router.push(ROUTES.MY_POOLS)
        }
      }, 3000)
    } catch (err: any) {
      console.error('[removeLiquidity] Error:', err)
      setTxError(err.message || 'Transaction failed')
      setRemoveStatus('error')
    }
  }

  const formatUsd = (value: number) => {
    if (value < 0.01) return '<$0.01'
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatAmount = (amount: number, decimals: number = 6) => {
    if (amount < 0.000001) return '<0.000001'
    return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })
  }

  const isClosed = position && (!position.liquidity || BigInt(position.liquidity) === 0n)
  const hasFees = position && position.feesEarnedUsd && position.feesEarnedUsd > 0

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <Link href={ROUTES.MY_POOLS} className="back-button">
          ← Back to Positions
        </Link>

        {!wallet ? (
          <div className="empty-state">
            <p>Connect your wallet to view this position</p>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading position...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={() => router.push(ROUTES.MY_POOLS)}>Back to Positions</button>
          </div>
        ) : !position ? (
          <div className="empty-state">
            <p>Position not found</p>
            <button onClick={() => router.push(ROUTES.MY_POOLS)}>Back to Positions</button>
          </div>
        ) : (
          <div className="position-detail-card">
            <div className="detail-header">
              <div>
                <h2 style={{ margin: 0 }}>{position.pair}</h2>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <span className={`version-badge ${position.version.toLowerCase()}`}>
                    {position.version}
                  </span>
                  {position.fee && (
                    <span className="fee-badge">{(position.fee / 10000).toFixed(2)}% fee</span>
                  )}
                  {position.version !== 'V2' && position.inRange !== undefined && (
                    <span className={`range-badge ${position.inRange ? 'in-range' : 'out-of-range'}`}>
                      {position.inRange ? 'In Range' : 'Out of Range'}
                    </span>
                  )}
                </div>
              </div>
              <div className="position-value" style={{ fontSize: '1.5rem' }}>
                {formatUsd(position.liquidityUsd)}
              </div>
            </div>

            {/* Token Amounts */}
            <div className="detail-section">
              <h3>Token Amounts</h3>
              <div className="detail-stats">
                <div className="stat-large">
                  <span className="stat-label">{position.token0.symbol}</span>
                  <span className="stat-value">{formatAmount(position.token0.amount)}</span>
                </div>
                <div className="stat-large">
                  <span className="stat-label">{position.token1.symbol}</span>
                  <span className="stat-value">{formatAmount(position.token1.amount)}</span>
                </div>
              </div>
            </div>

            {/* Price Range (V3/V4 only) */}
            {position.priceRange && (
              <div className="detail-section">
                <h3>Price Range</h3>
                <div className="detail-stats">
                  <div className="stat-large">
                    <span className="stat-label">Min Price</span>
                    <span className="stat-value">{formatAmount(position.priceRange.min, 8)}</span>
                  </div>
                  <div className="stat-large">
                    <span className="stat-label">Max Price</span>
                    <span className="stat-value">{formatAmount(position.priceRange.max, 8)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Unclaimed Fees */}
            {hasFees && !isClosed && (
              <div className="detail-section">
                <h3>Unclaimed Fees</h3>
                <div className="unclaimed-fees" style={{ marginTop: 0 }}>
                  <span className="fees-label">Available to collect</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                    {formatUsd(position.feesEarnedUsd)}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            {!isClosed && (
              <div className="detail-actions">
                {hasFees && position.version !== 'V2' && (
                  <button
                    className="btn btn-primary full-width"
                    onClick={handleCollectFees}
                    disabled={collectStatus !== 'idle'}
                  >
                    {collectStatus === 'building' && 'Building...'}
                    {collectStatus === 'pending' && (
                      <>
                        <span className="loading-spinner small" /> Collecting...
                      </>
                    )}
                    {collectStatus === 'success' && 'Collected!'}
                    {collectStatus === 'error' && 'Failed - Try Again'}
                    {collectStatus === 'idle' && 'Collect Fees'}
                  </button>
                )}

                <button
                  className="btn btn-secondary full-width"
                  onClick={() => setShowRemoveModal(true)}
                >
                  Remove Liquidity
                </button>

                <Link
                  href={`${ROUTES.ADD_LIQUIDITY}?pool=${position.poolAddress}&version=${position.version}`}
                  className="btn btn-secondary full-width"
                  style={{ textAlign: 'center' }}
                >
                  Add More Liquidity
                </Link>
              </div>
            )}

            {isClosed && (
              <div className="info-message" style={{ marginTop: '1rem' }}>
                This position has been closed. No further actions available.
              </div>
            )}

            {txError && (
              <div className="tx-error" style={{ marginTop: '1rem' }}>
                {txError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Remove Liquidity Modal */}
      {showRemoveModal && position && (
        <div className="modal-overlay visible">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Remove Liquidity</span>
              <button
                className="modal-close"
                onClick={() => {
                  setShowRemoveModal(false)
                  setRemovePercentage(0)
                  setRemoveStatus('idle')
                  setTxError(null)
                }}
                disabled={removeStatus === 'pending'}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="remove-liquidity-form">
                <div className="input-group">
                  <span className="input-label">Amount to Remove</span>
                  <div className="percentage-display">{removePercentage}%</div>
                  <input
                    type="range"
                    className="percentage-slider"
                    min="0"
                    max="100"
                    step="1"
                    value={removePercentage}
                    onChange={(e) => setRemovePercentage(Number(e.target.value))}
                    disabled={removeStatus === 'pending'}
                  />
                  <div className="percentage-buttons">
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setRemovePercentage(pct)}
                        disabled={removeStatus === 'pending'}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="remove-preview">
                  <div className="preview-header">You will receive</div>
                  <div className="preview-amounts">
                    <div className="preview-row">
                      <span className="token-symbol">{position.token0.symbol}</span>
                      <span className="amount">
                        {formatAmount(position.token0.amount * (removePercentage / 100))}
                      </span>
                    </div>
                    <div className="preview-row">
                      <span className="token-symbol">{position.token1.symbol}</span>
                      <span className="amount">
                        {formatAmount(position.token1.amount * (removePercentage / 100))}
                      </span>
                    </div>
                  </div>
                  {hasFees && position.version !== 'V2' && (
                    <div className="fees-note">
                      Unclaimed fees will also be collected
                    </div>
                  )}
                </div>

                {txError && (
                  <div className="tx-error">{txError}</div>
                )}

                <button
                  className="btn btn-primary full-width"
                  onClick={handleRemoveLiquidity}
                  disabled={removePercentage === 0 || removeStatus === 'pending' || removeStatus === 'building'}
                >
                  {removeStatus === 'building' && 'Building...'}
                  {removeStatus === 'pending' && (
                    <>
                      <span className="loading-spinner small" /> Removing...
                    </>
                  )}
                  {removeStatus === 'success' && 'Success!'}
                  {removeStatus === 'error' && 'Failed - Try Again'}
                  {removeStatus === 'idle' && (
                    removePercentage === 100 ? 'Remove All & Close Position' : `Remove ${removePercentage}%`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
