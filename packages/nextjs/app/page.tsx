'use client'

import { useEffect } from 'react'
import { useAppState } from '@/store/AppContext'
import { fetchPools } from '@/services/api'
import { formatUsd, formatPrice, formatChange } from '@/utils/format'
import { FEATURED_POOLS, type FeaturedPoolConfig } from '@/utils/constants'
import type { Pool } from '@/utils/types'
import { AppHeader } from '@/components/AppHeader'
import Link from 'next/link'

export default function HomePage() {
  const { state, setState } = useAppState()
  const { pools, loading, error, wallet } = state

  useEffect(() => {
    if (!loading && pools.length === 0) {
      loadPools()
    }
  }, [])

  async function loadPools() {
    setState({ loading: true, error: null })

    try {
      const data = await fetchPools()
      setState({
        pools: data.pools,
        globalStats: {
          arbmePrice: data.arbmePrice,
          totalTvl: data.totalTvl,
        },
        loading: false
      })
    } catch (err) {
      console.error('[Home] Failed to load pools:', err)
      setState({
        error: 'Failed to load pools. Please try again.',
        loading: false,
      })
    }
  }

  function matchesTokenPair(pool: Pool, config: FeaturedPoolConfig): boolean {
    if (!pool.token0 || !pool.token1) return false

    const p0 = pool.token0.toLowerCase()
    const p1 = pool.token1.toLowerCase()
    const c0 = config.token0Address.toLowerCase()
    const c1 = config.token1Address.toLowerCase()

    return (p0 === c0 && p1 === c1) || (p0 === c1 && p1 === c0)
  }

  function getFeaturedPools(): Pool[] {
    const featuredPools: Pool[] = []

    for (const config of FEATURED_POOLS) {
      const match = pools.find(p => matchesTokenPair(p, config))
      if (match) {
        featuredPools.push(match)
      }
    }

    return featuredPools.sort((a, b) => {
      const aConfig = FEATURED_POOLS.find(c => matchesTokenPair(a, c))
      const bConfig = FEATURED_POOLS.find(c => matchesTokenPair(b, c))
      return (aConfig?.priority || 999) - (bConfig?.priority || 999)
    })
  }

  const featuredPools = getFeaturedPools()

  return (
    <div className="home-page">
      <AppHeader />

      {error && <div className="error-banner">{error}</div>}

      <div className="pools-grid">
        {loading && FEATURED_POOLS.map((_, i) => (
          <div key={i} className="pool-card loading">
            <div className="spinner"></div>
            <p className="text-secondary">Loading pool...</p>
          </div>
        ))}

        {!loading && featuredPools.map(pool => (
          <div key={pool.pairAddress} className="pool-card">
            <div className="pool-header">
              <h3>{pool.pair}</h3>
              <span className="pool-dex text-secondary">{pool.dex}</span>
            </div>

            <div className="pool-price">
              <span className="price-value">{formatPrice(pool.priceUsd)}</span>
              <span className={`price-change ${pool.priceChange24h >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatChange(pool.priceChange24h)}
              </span>
            </div>

            <div className="pool-stats">
              <div className="stat">
                <span className="stat-label text-secondary">TVL</span>
                <span className="stat-value">{formatUsd(pool.tvl)}</span>
              </div>
              <div className="stat">
                <span className="stat-label text-secondary">24h Volume</span>
                <span className="stat-value">{formatUsd(pool.volume24h)}</span>
              </div>
            </div>

            <a href={pool.url} target="_blank" rel="noopener noreferrer" className="pool-link">
              View on DexScreener →
            </a>
          </div>
        ))}
      </div>

      {wallet && (
        <div className="home-actions">
          <Link href="/app/positions" className="button-secondary">View My Positions</Link>
          <Link href="/app/create-pool" className="button-secondary">Create New Pool</Link>
        </div>
      )}
    </div>
  )
}
