import { useQuery } from '@tanstack/react-query'
import { getPools, type PoolData } from '../lib/api'
import { getTokenByAddress } from '../lib/constants'
import { formatUsd } from '../lib/transactions'

interface PoolListProps {
  onAddLiquidity?: (pool: PoolData) => void
  onCreatePool?: () => void
}

function PoolCard({ pool, onAdd }: { pool: PoolData; onAdd?: () => void }) {
  const token0 = getTokenByAddress(pool.token0)
  const token1 = getTokenByAddress(pool.token1)

  // Get version badge class
  const getBadgeClass = () => {
    if (pool.dex.includes('V4')) return 'v4'
    if (pool.dex.includes('V3')) return 'v3'
    return 'v2'
  }

  return (
    <div className="pool-card">
      <div className="pool-top">
        <div className="pool-icons">
          {token0?.icon ? (
            <img src={token0.icon} alt={pool.token0Symbol} className="pool-icon" />
          ) : (
            <div className="pool-icon" style={{ background: token0?.color || '#7a7a8f' }} />
          )}
          {token1?.icon ? (
            <img src={token1.icon} alt={pool.token1Symbol} className="pool-icon" />
          ) : (
            <div className="pool-icon" style={{ background: token1?.color || '#7a7a8f' }} />
          )}
        </div>
        <div className="pool-info">
          <div className="pool-name">{pool.name}</div>
          <div className="pool-meta">
            <span className="pool-dex">{pool.dex}</span>
            <span className={`pool-badge ${getBadgeClass()}`}>
              {pool.dex.includes('V4') ? 'V4' : pool.dex.includes('V3') ? 'V3' : 'V2'}
            </span>
          </div>
        </div>
        <button className="pool-add-btn" onClick={onAdd}>
          +
        </button>
      </div>
      {(pool.liquidity || pool.volume24h || pool.priceUsd) && (
        <div className="pool-stats">
          {pool.liquidity && (
            <div className="pool-stat">
              <div className="pool-stat-label">TVL</div>
              <div className="pool-stat-value tvl">{formatUsd(pool.liquidity)}</div>
            </div>
          )}
          {pool.volume24h && (
            <div className="pool-stat">
              <div className="pool-stat-label">24h Vol</div>
              <div className="pool-stat-value">{formatUsd(pool.volume24h)}</div>
            </div>
          )}
          {pool.priceUsd && (
            <div className="pool-stat">
              <div className="pool-stat-label">Price</div>
              <div className="pool-stat-value">{formatUsd(pool.priceUsd)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PoolList({ onAddLiquidity, onCreatePool }: PoolListProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pools'],
    queryFn: getPools,
    staleTime: 60_000, // 1 minute
    refetchInterval: 5 * 60_000, // 5 minutes
  })

  if (isLoading) {
    return (
      <section className="pools-section">
        <div className="section-header">
          <h2>Available Pools</h2>
        </div>
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>Loading pools...</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="pools-section">
        <div className="section-header">
          <h2>Available Pools</h2>
        </div>
        <div className="error-state">
          <p>Failed to load pools</p>
          <button onClick={() => refetch()}>Retry</button>
        </div>
      </section>
    )
  }

  const pools = data?.pools ?? []

  return (
    <section className="pools-section">
      <div className="section-header">
        <h2>
          Available Pools
          <span className="count">({pools.length})</span>
        </h2>
        <div className="header-actions">
          {onCreatePool && (
            <button className="btn btn-primary btn-sm" onClick={onCreatePool}>
              + Create Pool
            </button>
          )}
          <button className="refresh-btn" onClick={() => refetch()}>
            Refresh
          </button>
        </div>
      </div>
      <div className="pools-grid">
        {pools.map((pool, idx) => (
          <PoolCard
            key={`${pool.address}-${idx}`}
            pool={pool}
            onAdd={() => onAddLiquidity?.(pool)}
          />
        ))}
      </div>
    </section>
  )
}
