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

  const formatUsd = (value: number) => {
    if (value < 0.01) return '<$0.01'
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatAmount = (amount: number, decimals: number = 4) => {
    if (amount < 0.0001) return '<0.0001'
    return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })
  }

  return (
    <Link
      href={`${ROUTES.POSITION_DETAIL}/${position.id}`}
      className={`position-card ${isClosed ? 'closed' : ''}`}
    >
      <div className="position-header">
        <div className="position-pair">
          <span className="pair-name">{position.pair}</span>
          <span className={`version-badge ${position.version.toLowerCase()}`}>
            {position.version}
          </span>
        </div>
        <div className="position-value">
          {formatUsd(position.liquidityUsd)}
        </div>
      </div>

      <div className="position-details">
        <div className="position-status">
          {position.version !== 'V2' && position.inRange !== undefined && (
            <span className={`range-badge ${position.inRange ? 'in-range' : 'out-of-range'}`}>
              {position.inRange ? 'In Range' : 'Out of Range'}
            </span>
          )}
          {position.fee && (
            <span className="fee-badge">{(position.fee / 10000).toFixed(2)}%</span>
          )}
        </div>

        <div className="position-amounts">
          <div className="amount-row">
            <span className="token-symbol">{position.token0.symbol}</span>
            <span className="amount">{formatAmount(position.token0.amount)}</span>
          </div>
          <div className="amount-row">
            <span className="token-symbol">{position.token1.symbol}</span>
            <span className="amount">{formatAmount(position.token1.amount)}</span>
          </div>
        </div>

        {hasFees && !isClosed && (
          <div className="unclaimed-fees">
            <span className="fees-label">Unclaimed Fees</span>
            {formatUsd(position.feesEarnedUsd)}
          </div>
        )}
      </div>
    </Link>
  )
}
