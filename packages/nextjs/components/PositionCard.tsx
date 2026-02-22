'use client'

import Link from 'next/link'
import { ROUTES } from '@/utils/constants'
import type { Position, PositionSummary } from '@/utils/types'

// Supports two calling conventions:
// 1. Desktop (old): <PositionCard position={pos} />
// 2. Farcaster (new): <PositionCard summary={s} enriched={pos} enriching={true} onRefresh={fn} />
type PositionCardProps =
  | { position: Position; summary?: never; enriched?: never; enriching?: never; onRefresh?: never; onSend?: never }
  | { position?: never; summary: PositionSummary; enriched?: Position; enriching?: boolean; onRefresh?: () => void; onSend?: () => void }

export function PositionCard(props: PositionCardProps) {
  // Normalize: if called with old `position` prop, derive summary + enriched from it
  const summary: PositionSummary = props.summary ?? {
    id: props.position!.id,
    version: props.position!.version,
    pair: props.position!.pair,
    poolAddress: props.position!.poolAddress || '',
    token0: { symbol: props.position!.token0.symbol, address: props.position!.token0.address || '', decimals: props.position!.token0.decimals || 18 },
    token1: { symbol: props.position!.token1.symbol, address: props.position!.token1.address || '', decimals: props.position!.token1.decimals || 18 },
    tokenId: props.position!.tokenId,
    fee: props.position!.fee,
    tickSpacing: props.position!.tickSpacing,
    hooks: props.position!.hooks,
    liquidityRaw: props.position!.liquidity || '',
  }
  const enriched = props.enriched ?? props.position ?? undefined
  const enriching = props.enriching ?? false
  const onRefresh = props.onRefresh
  const onSend = props.onSend

  const hasEnriched = !!enriched
  const hasLiquidityString = enriched?.liquidity && enriched.liquidity !== '0'
  const isClosed = hasEnriched && (!enriched.liquidityUsd || enriched.liquidityUsd === 0)
  const isStale = isClosed && hasLiquidityString
  const hasFees = hasEnriched && enriched.feesEarnedUsd && enriched.feesEarnedUsd > 0

  const formatUsd = (value: number | undefined) => {
    if (value === undefined || value === null) return '$0.00'
    if (value < 0.01) return '<$0.01'
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatAmount = (amount: number | undefined, decimals: number = 4) => {
    if (amount === undefined || amount === null) return '0'
    if (amount < 0.0001) return '<0.0001'
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
    if (amount >= 100_000) return `${(amount / 1_000).toFixed(1)}K`
    if (amount >= 1_000) return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })
  }

  return (
    <Link
      href={`${ROUTES.POSITION_DETAIL}/${summary.id}`}
      className={`position-card ${isClosed && !isStale ? 'closed' : ''} ${isStale ? 'position-stale' : ''}`}
    >
      <div className="position-card-top">
        <span className="position-pair-name">{summary.pair}</span>
        <div className="position-badges">
          <span className="position-version-badge">{summary.version}</span>
          {hasEnriched && enriched.version !== 'V2' && enriched.inRange !== undefined && (
            <span className={`position-range-badge ${enriched.inRange ? 'in-range' : 'out-of-range'}`}>
              {enriched.inRange ? 'In Range' : 'Out of Range'}
            </span>
          )}
          {(onRefresh || onSend) && (
            <span className="position-card-actions">
              {onRefresh && (
                <button
                  className="position-card-action-btn"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRefresh(); }}
                  title="Refresh"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: '0.85rem', color: 'var(--text-muted, #888)' }}
                >
                  &#x21BB;
                </button>
              )}
              {onSend && summary.version !== 'V2' && (
                <button
                  className="position-card-action-btn"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSend(); }}
                  title="Send"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: '0.85rem', color: 'var(--text-muted, #888)' }}
                >
                  &#x2197;
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="position-card-stats">
        <div className="position-stat-col">
          <span className="position-stat-label">Value</span>
          <span className="position-stat-value accent">
            {!hasEnriched || enriching ? (
              <span className="shimmer-text">loading...</span>
            ) : isStale ? (
              '$ --'
            ) : isClosed ? (
              'Price unavailable'
            ) : (
              formatUsd(enriched.liquidityUsd)
            )}
          </span>
        </div>
        {hasEnriched && hasFees && !isClosed && (
          <div className="position-stat-col">
            <span className="position-stat-label">Fees</span>
            <span className="position-stat-value">{formatUsd(enriched.feesEarnedUsd)}</span>
          </div>
        )}
        {summary.fee && (
          <div className="position-stat-col">
            <span className="position-stat-label">Fee Tier</span>
            <span className="position-stat-value">{(summary.fee / 10000).toFixed(2)}%</span>
          </div>
        )}
      </div>

      <div className="position-card-amounts">
        {hasEnriched ? (
          <>
            <span className="position-token-amount">
              {enriched.token0?.symbol || '???'}: {formatAmount(enriched.token0?.amount)}
            </span>
            <span className="position-token-amount">
              {enriched.token1?.symbol || '???'}: {formatAmount(enriched.token1?.amount)}
            </span>
          </>
        ) : (
          <>
            <span className="position-token-amount">
              {summary.token0.symbol}: <span className="shimmer-text">--</span>
            </span>
            <span className="position-token-amount">
              {summary.token1.symbol}: <span className="shimmer-text">--</span>
            </span>
          </>
        )}
      </div>
    </Link>
  )
}
