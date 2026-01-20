import type { Position, V2Position, V3Position, V4Position } from '../lib/api'

interface PositionCardProps {
  position: Position
  prices?: Record<string, number>
  onAddLiquidity?: (position: Position) => void
  onRemoveLiquidity?: (position: Position) => void
}

function formatNumber(num: number, decimals = 2): string {
  if (num === 0) return '0'
  if (num < 0.0001) return '<0.0001'
  if (num < 1) return num.toFixed(4)
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toFixed(decimals)
}

function formatUsd(num: number): string {
  if (num < 0.01) return '<$0.01'
  return `$${formatNumber(num)}`
}

function V2PositionDetails({ position }: { position: V2Position }) {
  return (
    <div className="position-details">
      <div className="position-amounts">
        <div className="amount-row">
          <span className="token-symbol">{position.token0Symbol}</span>
          <span className="amount">{formatNumber(position.token0Amount)}</span>
        </div>
        <div className="amount-row">
          <span className="token-symbol">{position.token1Symbol}</span>
          <span className="amount">{formatNumber(position.token1Amount)}</span>
        </div>
      </div>
      <div className="position-meta">
        <span className="pool-share">{position.sharePercent.toFixed(4)}% of pool</span>
      </div>
    </div>
  )
}

function V3PositionDetails({ position }: { position: V3Position }) {
  return (
    <div className="position-details">
      <div className="position-status">
        <span className={`range-badge ${position.inRange ? 'in-range' : 'out-of-range'}`}>
          {position.inRange ? 'In Range' : 'Out of Range'}
        </span>
        <span className="fee-badge">{position.fee}</span>
      </div>
      <div className="position-amounts">
        <div className="amount-row">
          <span className="token-symbol">{position.token0}</span>
          <span className="amount">{formatNumber(position.token0Amount)}</span>
        </div>
        <div className="amount-row">
          <span className="token-symbol">{position.token1}</span>
          <span className="amount">{formatNumber(position.token1Amount)}</span>
        </div>
      </div>
      {position.hasUnclaimedFees && (
        <div className="unclaimed-fees">
          <span className="fees-label">Unclaimed fees:</span>
          <span>{formatNumber(position.tokensOwed0)} {position.token0}</span>
          <span>{formatNumber(position.tokensOwed1)} {position.token1}</span>
        </div>
      )}
    </div>
  )
}

function V4PositionDetails({ position }: { position: V4Position }) {
  return (
    <div className="position-details">
      <div className="position-status">
        <span className={`range-badge ${position.inRange ? 'in-range' : 'out-of-range'}`}>
          {position.inRange ? 'In Range' : 'Out of Range'}
        </span>
        <span className="fee-badge">{position.feePercent}</span>
      </div>
      <div className="position-amounts">
        <div className="amount-row">
          <span className="token-symbol">{position.token0Symbol}</span>
          <span className="amount">{formatNumber(position.token0Amount)}</span>
        </div>
        <div className="amount-row">
          <span className="token-symbol">{position.token1Symbol}</span>
          <span className="amount">{formatNumber(position.token1Amount)}</span>
        </div>
      </div>
      {position.hasUnclaimedFees && (
        <div className="unclaimed-fees">
          <span className="fees-label">Unclaimed fees:</span>
          <span>{formatNumber(position.tokensOwed0)} {position.token0Symbol}</span>
          <span>{formatNumber(position.tokensOwed1)} {position.token1Symbol}</span>
        </div>
      )}
    </div>
  )
}

export function PositionCard({ position, prices, onAddLiquidity, onRemoveLiquidity }: PositionCardProps) {
  // Calculate USD value
  let usdValue = 0
  if (prices) {
    let token0Address: string
    let token1Address: string

    if (position.type === 'V2') {
      token0Address = position.token0
      token1Address = position.token1
    } else if (position.type === 'V3') {
      token0Address = position.token0Address
      token1Address = position.token1Address
    } else {
      token0Address = position.currency0
      token1Address = position.currency1
    }

    const price0 = prices[token0Address.toLowerCase()] || 0
    const price1 = prices[token1Address.toLowerCase()] || 0
    usdValue = position.token0Amount * price0 + position.token1Amount * price1
  }

  // Get pair name
  const pairName = position.type === 'V2' || position.type === 'V3'
    ? position.pair
    : `${position.token0Symbol} / ${position.token1Symbol}`

  // Check if closed
  const isClosed = position.type === 'V2'
    ? position.lpBalance === 0
    : position.type === 'V3'
      ? position.isClosed
      : !position.hasLiquidity

  return (
    <div className={`position-card ${isClosed ? 'closed' : ''}`}>
      <div className="position-header">
        <div className="position-pair">
          <span className="pair-name">{pairName}</span>
          <span className="version-badge">{position.type}</span>
        </div>
        <div className="position-value">
          {usdValue > 0 ? formatUsd(usdValue) : 'N/A'}
        </div>
      </div>

      {position.type === 'V2' && <V2PositionDetails position={position} />}
      {position.type === 'V3' && <V3PositionDetails position={position} />}
      {position.type === 'V4' && <V4PositionDetails position={position} />}

      {!isClosed && (
        <div className="position-actions">
          <button
            className="btn btn-secondary"
            onClick={() => onAddLiquidity?.(position)}
          >
            Add
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onRemoveLiquidity?.(position)}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}
