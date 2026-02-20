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

  // Collect All state
  const [collectAllStatus, setCollectAllStatus] = useState<CollectAllStatus>('idle')
  const [collectProgress, setCollectProgress] = useState({ current: 0, total: 0, succeeded: 0, failed: 0 })

  // Paginate for all users — Farcaster webview is memory-constrained, desktop just avoids DOM bloat
  const PAGE_SIZE = isFarcaster ? 3 : 20
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const displayedPositions = positions.slice(0, visibleCount)
  const hasMore = visibleCount < positions.length

  // Total TVL across all positions
  const totalTvl = useMemo(() =>
    positions.reduce((sum, p) => sum + (p.liquidityUsd || 0), 0),
    [positions]
  )

  // Positions eligible for fee collection (V3/V4 with uncollected fees)
  const collectablePositions = useMemo(() =>
    positions.filter(p =>
      p.feesEarnedUsd > 0 &&
      p.version !== 'V2'
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
            <span className="count">({positions.length})</span>
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
            <Link href={ROUTES.ADD_LIQUIDITY} className="btn btn-primary btn-sm">
              + Add
            </Link>
          </div>
        </div>

        {positions.length > 0 && totalTvl > 0 && (
          <div className="tvl-banner">
            <div className="tvl-banner-info">
              <span className="tvl-banner-label">Total Value</span>
              <span className="tvl-banner-amount">{formatUsd(totalTvl)}</span>
            </div>
          </div>
        )}

        {collectablePositions.length > 0 && (
          <div className="collect-all-card">
            <div className="collect-all-info">
              <span className="collect-all-label">Uncollected Fees</span>
              <span className="collect-all-amount">{formatUsd(totalFees)}</span>
              <span className="collect-all-detail">{collectablePositions.length} position{collectablePositions.length !== 1 ? 's' : ''}</span>
            </div>
            <button
              className="btn btn-primary collect-all-btn"
              onClick={handleCollectAll}
              disabled={collectAllStatus === 'collecting'}
            >
              {collectAllStatus === 'idle' && 'Collect All'}
              {collectAllStatus === 'collecting' && `${collectProgress.current}/${collectProgress.total}...`}
              {collectAllStatus === 'done' && (isSafe ? 'Proposed!' : `Done! (${collectProgress.succeeded}/${collectProgress.total})`)}
              {collectAllStatus === 'error' && 'Retry'}
            </button>
          </div>
        )}

        {error && positions.length > 0 && (
          <div className="error-banner-inline" onClick={refresh} role="button" tabIndex={0}>
            Prices may be stale — tap to retry
          </div>
        )}

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
        ) : error && positions.length === 0 ? (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : displayedPositions.length === 0 ? (
          <div className="empty-state">
            <p>No positions found</p>
            <p className="hint">Add liquidity to a pool to get started</p>
            <p className="hint">If you believe this is an error, refresh to try again.</p>
            <Link href={ROUTES.ADD_LIQUIDITY} className="btn btn-primary" style={{ marginTop: '1rem' }}>
              Add Liquidity
            </Link>
          </div>
        ) : (
          <>
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
                Load More ({positions.length - visibleCount} remaining)
              </button>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  )
}
