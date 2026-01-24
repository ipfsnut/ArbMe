'use client'

import { useState } from 'react'
import { useAppState } from '@/store/AppContext'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import PoolsWidget from '@/components/PoolsWidget'
import { formatPrice } from '@/utils/format'
import type { PoolsResponse } from '@/utils/types'

export default function HomePage() {
  const { state, setState } = useAppState()
  const [statsLoaded, setStatsLoaded] = useState(false)

  const arbmePrice = typeof state.globalStats?.arbmePrice === 'number'
    ? state.globalStats.arbmePrice
    : parseFloat(state.globalStats?.arbmePrice || '0') || 0
  const totalTvl = typeof state.globalStats?.totalTvl === 'number'
    ? state.globalStats.totalTvl
    : parseFloat(state.globalStats?.totalTvl || '0') || 0

  const handleDataLoaded = (data: PoolsResponse) => {
    setState({
      pools: data.pools,
      globalStats: {
        arbmePrice: data.arbmePrice,
        totalTvl: data.totalTvl,
      },
      loading: false
    })
    setStatsLoaded(true)
  }

  const loading = !statsLoaded

  return (
    <div className="home-page">
      <AppHeader />

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
          </div>

          <div className="contract-address-section">
            <div className="contract-label">Contract Address</div>
            <div className="contract-address">
              <code>0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07</code>
              <button
                className="copy-button"
                onClick={() => {
                  navigator.clipboard.writeText('0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07')
                  alert('Contract address copied!')
                }}
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Top Pools Section */}
      <div className="featured-section">
        <h2 className="section-title">$ARBME Pools</h2>
        <p className="section-subtitle">Top pools by TVL</p>
        <PoolsWidget
          limit={5}
          showPrices={true}
          onDataLoaded={handleDataLoaded}
        />
      </div>

      <Footer />
    </div>
  )
}
