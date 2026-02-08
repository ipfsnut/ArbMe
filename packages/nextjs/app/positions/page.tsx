'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useWallet, useIsFarcaster, useIsSafe } from '@/hooks/useWallet'
import { usePositions } from '@/hooks/usePositions'
import { useSendTransaction } from 'wagmi'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { PositionCard } from '@/components/PositionCard'
import { ROUTES } from '@/utils/constants'
import type { Position } from '@/utils/types'

type CollectAllStatus = 'idle' | 'collecting' | 'done' | 'error'

export default function PositionsPage() {
  const wallet = useWallet()
  const isFarcaster = useIsFarcaster()
  const isSafe = useIsSafe()
  const { sendTransactionAsync } = useSendTransaction()
  const { positions, loading, refreshing, error, lastRefresh, refresh, invalidate } = usePositions(wallet)
  const [showClosed, setShowClosed] = useState(false)

  // Collect All state
  const [collectAllStatus, setCollectAllStatus] = useState<CollectAllStatus>('idle')
  const [collectProgress, setCollectProgress] = useState({ current: 0, total: 0, succeeded: 0, failed: 0 })

  // All positions returned from the API have on-chain liquidity.
  // Positions with liquidityUsd === 0 have active liquidity but missing price data.
  const pricedPositions = positions.filter(p => p.liquidityUsd > 0)
  const unpricedPositions = positions.filter(p => !p.liquidityUsd || p.liquidityUsd === 0)

  const baseDisplayed = showClosed ? positions : pricedPositions

  // Farcaster: paginate to avoid webview memory issues
  const PAGE_SIZE = 3
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const displayedPositions = isFarcaster ? baseDisplayed.slice(0, visibleCount) : baseDisplayed
  const hasMore = isFarcaster && visibleCount < baseDisplayed.length

  // Positions eligible for fee collection
  const collectablePositions = useMemo(() =>
    positions.filter(p =>
      p.feesEarnedUsd > 0 &&
      p.version !== 'V2' &&
      p.liquidityUsd > 0
    ),
    [positions]
  )

  const totalFees = useMemo(() =>
    collectablePositions.reduce((sum, p) => sum + (p.feesEarnedUsd || 0), 0),
    [collectablePositions]
  )

  const sendTx = async (tx: { to: string; data: string; value: string }) => {
    if (!wallet) throw new Error('No wallet connected')

    if (isFarcaster) {
      const farcasterSdk = (await import('@farcaster/miniapp-sdk')).default
      const provider = await farcasterSdk.wallet.getEthereumProvider()
      if (!provider) throw new Error('No wallet provider')

      return await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet as `0x${string}`,
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: tx.value !== '0' ? `0x${BigInt(tx.value).toString(16)}` as `0x${string}` : '0x0',
        }],
      }) as string
    } else {
      return await sendTransactionAsync({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value !== '0' ? BigInt(tx.value) : 0n,
      })
    }
  }

  const handleCollectAll = async () => {
    if (collectablePositions.length === 0 || !wallet) return

    setCollectAllStatus('collecting')
    const progress = { current: 0, total: collectablePositions.length, succeeded: 0, failed: 0 }
    setCollectProgress(progress)

    for (const pos of collectablePositions) {
      progress.current++
      setCollectProgress({ ...progress })

      try {
        const res = await fetch('/api/collect-fees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positionId: pos.id,
            recipient: wallet,
            currency0: pos.token0?.address,
            currency1: pos.token1?.address,
          }),
        })

        if (!res.ok) {
          progress.failed++
          continue
        }

        const { transaction } = await res.json()
        await sendTx(transaction)
        progress.succeeded++
      } catch {
        progress.failed++
      }

      setCollectProgress({ ...progress })
    }

    setCollectAllStatus(progress.failed === progress.total ? 'error' : 'done')

    // Refresh positions after collecting
    setTimeout(async () => {
      await invalidate()
      setCollectAllStatus('idle')
      setCollectProgress({ current: 0, total: 0, succeeded: 0, failed: 0 })
    }, 3000)
  }

  const formatUsd = (value: number) => {
    if (value < 0.01) return '<$0.01'
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
    return `$${value.toFixed(2)}`
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back to Home" />

        <div className="section-header">
          <h2>
            My Positions
            <span className="count">({pricedPositions.length})</span>
            {unpricedPositions.length > 0 && (
              <span className="closed-count">+ {unpricedPositions.length} unpriced</span>
            )}
          </h2>
          <div className="header-actions">
            <span className="cache-age" style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)', marginRight: '0.5rem' }}>
              {lastRefresh !== 'Never' && lastRefresh}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={refresh}
              disabled={refreshing}
              style={{ minWidth: 'auto', padding: '0.25rem 0.5rem' }}
            >
              {refreshing ? '...' : '\u21BB'}
            </button>
            {collectablePositions.length > 0 && (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCollectAll}
                disabled={collectAllStatus === 'collecting'}
                style={{ minWidth: 'auto' }}
              >
                {collectAllStatus === 'idle' && `Collect All (${formatUsd(totalFees)})`}
                {collectAllStatus === 'collecting' && `${collectProgress.current}/${collectProgress.total}...`}
                {collectAllStatus === 'done' && (isSafe ? 'Proposed!' : `Done! (${collectProgress.succeeded}/${collectProgress.total})`)}
                {collectAllStatus === 'error' && 'Failed'}
              </button>
            )}
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
            <p className="hint">If you believe this is an error, refresh to try again.</p>
            <Link href={ROUTES.ADD_LIQUIDITY} className="btn btn-primary" style={{ marginTop: '1rem' }}>
              Add Liquidity
            </Link>
          </div>
        ) : (
          <>
            {unpricedPositions.length > 0 && (
              <div className="positions-filter">
                <label className="filter-toggle">
                  <input
                    type="checkbox"
                    checked={showClosed}
                    onChange={(e) => setShowClosed(e.target.checked)}
                  />
                  <span className="filter-label">Show positions without price data</span>
                </label>
              </div>
            )}

            <div className="positions-grid">
              {displayedPositions.map((position) => (
                <PositionCard key={position.id} position={position} />
              ))}
            </div>

            {hasMore && (
              <button
                className="btn btn-secondary full-width"
                onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                style={{ marginTop: '1rem' }}
              >
                Load More ({baseDisplayed.length - visibleCount} remaining)
              </button>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  )
}
