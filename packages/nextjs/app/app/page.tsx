'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAppState } from '@/store/AppContext'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import PoolsWidget from '@/components/PoolsWidget'
import { formatPrice } from '@/utils/format'
import { ROUTES } from '@/utils/constants'
import { buyArbme } from '@/lib/actions'
import type { PoolsResponse } from '@/utils/types'

export default function AppPage() {
  const { state, setState } = useAppState()
  const [statsLoaded, setStatsLoaded] = useState(false)

  const arbmePrice = typeof state.globalStats?.arbmePrice === 'number'
    ? state.globalStats.arbmePrice
    : parseFloat(state.globalStats?.arbmePrice || '0') || 0
  const handleDataLoaded = (data: PoolsResponse) => {
    setState({
      pools: data.pools,
      globalStats: {
        arbmePrice: data.arbmePrice,
        chaosPrice: '0',
        ratchetPrice: data.ratchetPrice,
        totalTvl: data.totalTvl,
        arbmeTvl: data.arbmeTvl,
        chaosTvl: 0,
        ratchetTvl: data.ratchetTvl,
        abcPrice: data.abcPrice,
        clawdPrice: data.clawdPrice,
        abcTvl: data.abcTvl,
        clawdTvl: data.clawdTvl,
      },
      loading: false
    })
    setStatsLoaded(true)
  }

  const loading = !statsLoaded

  return (
    <div className="app">
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
          </div>

          <div
            className="contract-address-section"
            onClick={() => {
              navigator.clipboard.writeText('0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07')
              alert('Copied!')
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className="contract-label">Contract Address (tap to copy)</div>
            <code className="contract-code">0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07</code>
          </div>
        </div>
      </div>

      {/* Top Pools Section */}
      <div className="featured-section">
        <h2 className="section-title">Top Pools</h2>
        <PoolsWidget
          limit={5}
          showPrices={true}
          onDataLoaded={handleDataLoaded}
        />
      </div>

      {/* Swap Section */}
      <div className="buy-tokens-section">
        <div className="buy-tokens-grid">
          <div className="buy-token-card">
            <img
              src="/arbie.png"
              alt="ARBME"
              className="buy-token-logo"
            />
            <div className="buy-token-name">$ARBME</div>
            <div className="buy-token-price">{loading ? '...' : formatPrice(arbmePrice)}</div>
            <button className="btn btn-primary" onClick={buyArbme}>Swap</button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
