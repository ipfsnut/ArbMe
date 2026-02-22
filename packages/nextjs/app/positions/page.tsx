'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useWallet, useIsFarcaster, useIsSafe } from '@/hooks/useWallet'
import { usePositions } from '@/hooks/usePositions'
import { usePositionList } from '@/hooks/usePositionList'
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

  // ── Desktop: old monolithic hook ──────────────────────────────────────────
  const desktop = usePositions(isFarcaster ? null : wallet)

  // ── Farcaster: progressive loading hook ───────────────────────────────────
  const fc = usePositionList(isFarcaster ? wallet : null)

  // ── Unified interface ─────────────────────────────────────────────────────
  const positions = isFarcaster ? [] as Position[] : desktop.positions
  const summaries = isFarcaster ? fc.summaries : []
  const enrichedMap = isFarcaster ? fc.enrichedMap : new Map<string, Position>()
  const loading = isFarcaster ? fc.loading : desktop.loading
  const refreshing = isFarcaster ? fc.refreshing : desktop.refreshing
  const error = isFarcaster ? fc.error : desktop.error
  const lastRefresh = isFarcaster ? fc.lastRefresh : desktop.lastRefresh
  const refresh = isFarcaster ? fc.refresh : desktop.refresh
  const invalidate = isFarcaster ? fc.refresh : desktop.invalidate

  // Item count for display
  const itemCount = isFarcaster ? summaries.length : positions.length

  // Collect All state
  const [collectAllStatus, setCollectAllStatus] = useState<CollectAllStatus>('idle')
  const [collectProgress, setCollectProgress] = useState({ current: 0, total: 0, succeeded: 0, failed: 0 })

  // Pagination
  const PAGE_SIZE = isFarcaster ? 3 : 20
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const hasMore = visibleCount < itemCount

  // Farcaster: trigger enrichment for visible positions
  const visibleSummaries = summaries.slice(0, visibleCount)
  const visibleIds = useMemo(
    () => visibleSummaries.map(s => s.id),
    [visibleSummaries.length, visibleCount, summaries]
  )
  useEffect(() => {
    if (isFarcaster && visibleIds.length > 0) {
      fc.enrichBatch(visibleIds)
    }
  }, [isFarcaster, visibleIds, fc.enrichBatch])

  // Desktop: displayed positions
  const displayedPositions = positions.slice(0, visibleCount)

  // TVL calculation
  const { totalTvl, pricedCount } = useMemo(() => {
    if (isFarcaster) {
      let tvl = 0
      let priced = 0
      for (const pos of enrichedMap.values()) {
        tvl += pos.liquidityUsd || 0
        if (pos.liquidityUsd > 0) priced++
      }
      return { totalTvl: tvl, pricedCount: priced }
    } else {
      const tvl = positions.reduce((sum, p) => sum + (p.liquidityUsd || 0), 0)
      const priced = positions.filter(p => p.liquidityUsd > 0).length
      return { totalTvl: tvl, pricedCount: priced }
    }
  }, [isFarcaster, positions, enrichedMap])

  // Collectable positions
  const collectablePositions = useMemo(() => {
    if (isFarcaster) {
      const result: Position[] = []
      for (const pos of enrichedMap.values()) {
        if (pos.feesEarnedUsd > 0 && pos.version !== 'V2') result.push(pos)
      }
      return result
    } else {
      return positions.filter(p => p.feesEarnedUsd > 0 && p.version !== 'V2')
    }
  }, [isFarcaster, positions, enrichedMap])

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
            <span className="count">({itemCount})</span>
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

        {itemCount > 0 && totalTvl > 0 && (
          <div className="tvl-banner">
            <div className="tvl-banner-info">
              <span className="tvl-banner-label">Total Value</span>
              <span className="tvl-banner-amount">
                {formatUsd(totalTvl)}
                {isFarcaster && pricedCount < summaries.length && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)', marginLeft: '0.5rem' }}>
                    ({pricedCount}/{summaries.length} priced)
                  </span>
                )}
              </span>
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

        {error && itemCount > 0 && (
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
        ) : error && itemCount === 0 ? (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : itemCount === 0 ? (
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
              {isFarcaster ? (
                /* Farcaster: progressive enrichment with summaries */
                visibleSummaries.map((summary) => (
                  <PositionCard
                    key={summary.id}
                    summary={summary}
                    enriched={enrichedMap.get(summary.id)}
                    enriching={!enrichedMap.has(summary.id)}
                    onRefresh={() => fc.refreshPosition(summary.id)}
                  />
                ))
              ) : (
                /* Desktop: fully enriched positions */
                displayedPositions.map((position) => (
                  <PositionCard key={position.id} position={position} />
                ))
              )}
            </div>

            {hasMore && (
              <button
                className="btn btn-secondary full-width"
                onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                style={{ marginTop: '1rem' }}
              >
                Load More ({itemCount - visibleCount} remaining)
              </button>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  )
}
