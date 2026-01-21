/**
 * Position card component
 * Displays user position information
 */

'use client';

import Link from 'next/link';
import { formatUsd } from '../utils/format';
import type { Position } from '../utils/types';

interface PositionCardProps {
  position: Position;
  onCollectFees?: (positionId: string) => void;
  collectingFees?: boolean;
}

export default function PositionCard({
  position,
  onCollectFees,
  collectingFees
}: PositionCardProps) {
  const inRangeBadge = position.inRange !== undefined
    ? position.inRange
      ? <span className="badge badge-success">In Range</span>
      : <span className="badge badge-warning">Out of Range</span>
    : null;

  return (
    <div className="position-card-container">
      <Link href={`/position/${position.id}`} className="position-card">
        <div className="position-header">
          <h3>{position.pair}</h3>
          <span className="position-version text-secondary">{position.version}</span>
        </div>

        <div className="position-stats">
          <div className="stat">
            <span className="stat-label text-secondary">Liquidity</span>
            <span className="stat-value">{formatUsd(position.liquidityUsd)}</span>
          </div>
          <div className="stat">
            <span className="stat-label text-secondary">Uncollected Fees</span>
            <span className="stat-value text-positive">
              {formatUsd(position.feesEarnedUsd)}
            </span>
          </div>
        </div>

        {inRangeBadge}

        <div className="position-arrow">→</div>
      </Link>

      {onCollectFees && position.version !== 'V2' && (
        <button
          className="collect-fees-btn"
          onClick={() => onCollectFees(position.id)}
          disabled={position.feesEarnedUsd === 0 || collectingFees}
        >
          {collectingFees ? 'Collecting...' : 'Collect Fees'}
        </button>
      )}
    </div>
  );
}
