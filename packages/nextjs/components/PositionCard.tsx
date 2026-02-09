'use client'

import Link from 'next/link'
import { ROUTES } from '@/utils/constants'
import type { Position } from '@/utils/types'

interface PositionCardProps {
  position: Position
}

export function PositionCard({ position }: PositionCardProps) {
  const isClosed = !position.liquidityUsd || position.liquidityUsd === 0
  const hasFees = position.feesEarnedUsd && position.feesEarnedUsd > 0

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
      href={`${ROUTES.POSITION_DETAIL}/${position.id}`}
      className={`position-card ${isClosed ? 'closed' : ''}`}
    >
      <div className="position-card-top">
        <span className="position-pair-name">{position.pair}</span>
        <div className="position-badges">
          <span className="position-version-badge">{position.version}</span>
          {position.version !== 'V2' && position.inRange !== undefined && (
            <span className={`position-range-badge ${position.inRange ? 'in-range' : 'out-of-range'}`}>
              {position.inRange ? 'In Range' : 'Out of Range'}
            </span>
          )}
        </div>
      </div>

      <div className="position-card-stats">
        <div className="position-stat-col">
          <span className="position-stat-label">Value</span>
          <span className="position-stat-value accent">
            {isClosed ? 'Price unavailable' : formatUsd(position.liquidityUsd)}
          </span>
        </div>
        {hasFees && !isClosed && (
          <div className="position-stat-col">
            <span className="position-stat-label">Fees</span>
            <span className="position-stat-value">{formatUsd(position.feesEarnedUsd)}</span>
          </div>
        )}
        {position.fee && (
          <div className="position-stat-col">
            <span className="position-stat-label">Fee Tier</span>
            <span className="position-stat-value">{(position.fee / 10000).toFixed(2)}%</span>
          </div>
        )}
      </div>

      <div className="position-card-amounts">
        <span className="position-token-amount">
          {position.token0?.symbol || '???'}: {formatAmount(position.token0?.amount)}
        </span>
        <span className="position-token-amount">
          {position.token1?.symbol || '???'}: {formatAmount(position.token1?.amount)}
        </span>
      </div>
    </Link>
  )
}
