'use client'

import { useEffect } from 'react'
import { useAppState } from '@/store/AppContext'
import { useWallet } from '@/hooks/useWallet'
import { fetchPools } from '@/services/api'
import { FEATURED_POOLS, type FeaturedPoolConfig } from '@/utils/constants'
import type { Pool } from '@/utils/types'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import PoolCard from '@/components/PoolCard'
import { formatPrice } from '@/utils/format'
import Link from 'next/link'

export default function HomePage() {
  const { state, setState } = useAppState()
  const { pools, loading, error } = state
  const wallet = useWallet()

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
  const arbmePrice = typeof state.globalStats?.arbmePrice === 'number'
    ? state.globalStats.arbmePrice
    : parseFloat(state.globalStats?.arbmePrice || '0') || 0
  const totalTvl = typeof state.globalStats?.totalTvl === 'number'
    ? state.globalStats.totalTvl
    : parseFloat(state.globalStats?.totalTvl || '0') || 0

  return (
    <div className="home-page">
      <AppHeader />

      {error && <div className="error-banner">{error}</div>}

      {/* Hero Section */}
      <div className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">Base • Arbitrage • DeFi</div>
          <h1 className="hero-title">$ARBME</h1>
          <p className="hero-description">
            A token that tracks price fluctuations in major coin markets and arbitrages the difference
          </p>

          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-label">Price</div>
              <div className="hero-stat-value">
                {loading ? '...' : formatPrice(arbmePrice)}
              </div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-label">Total TVL</div>
              <div className="hero-stat-value">
                {loading ? '...' : `$${totalTvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </div>
            </div>
          </div>

          <div className="hero-actions">
            <a
              href="https://app.uniswap.org/swap?outputCurrency=0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07&chain=base"
              target="_blank"
              rel="noopener noreferrer"
              className="button-primary hero-cta"
            >
              Buy $ARBME
            </a>
            {wallet && (
              <a href="/app/positions" className="button-secondary">
                My Pools
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Featured Pools Section */}
      <div className="featured-section">
        <h2 className="section-title">Featured Pools</h2>
        <div className="pools-grid">
          {loading || featuredPools.length === 0
            ? FEATURED_POOLS.map((_, i) => <PoolCard key={i} pool={null} />)
            : featuredPools.map(pool => <PoolCard key={pool.id} pool={pool} />)
          }
        </div>
      </div>

      {wallet && (
        <div className="home-actions">
          <a href="/app/create-pool" className="button-secondary">Create New Pool</a>
        </div>
      )}

      <Footer />
    </div>
  )
}
