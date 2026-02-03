'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAppState } from '@/store/AppContext'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import PoolsWidget from '@/components/PoolsWidget'
import { formatPrice } from '@/utils/format'
import { ROUTES } from '@/utils/constants'
import { buyArbme, buyRatchet, buyAbc } from '@/lib/actions'
import type { PoolsResponse } from '@/utils/types'

export default function AppPage() {
  const { state, setState } = useAppState()
  const [statsLoaded, setStatsLoaded] = useState(false)

  const arbmePrice = typeof state.globalStats?.arbmePrice === 'number'
    ? state.globalStats.arbmePrice
    : parseFloat(state.globalStats?.arbmePrice || '0') || 0
  const arbmeTvl = state.globalStats?.arbmeTvl || 0

  const ratchetPrice = parseFloat(state.globalStats?.ratchetPrice || '0') || 0
  const abcPrice = parseFloat(state.globalStats?.abcPrice || '0') || 0

  const handleDataLoaded = (data: PoolsResponse) => {
    setState({
      pools: data.pools,
      globalStats: {
        arbmePrice: data.arbmePrice,
        ratchetPrice: data.ratchetPrice,
        abcPrice: data.abcPrice,
        clawdPrice: data.clawdPrice,
        totalTvl: data.totalTvl,
        arbmeTvl: data.arbmeTvl,
        ratchetTvl: data.ratchetTvl,
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
            <div className="hero-stat">
              <div className="hero-stat-label">$ARBME TVL</div>
              <div className="hero-stat-value">
                {loading ? '...' : `$${arbmeTvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
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

      {/* Buy Tokens Section */}
      <div className="buy-tokens-section">
        <h2 className="section-title">Buy Tokens</h2>
        <div className="buy-tokens-grid">
          <div className="buy-token-card">
            <img
              src="/arbie.png"
              alt="ARBME"
              className="buy-token-logo"
            />
            <div className="buy-token-name">$ARBME</div>
            <div className="buy-token-price">{loading ? '...' : formatPrice(arbmePrice)}</div>
            <button className="btn btn-primary" onClick={buyArbme}>Buy $ARBME</button>
          </div>
          <div className="buy-token-card">
            <img
              src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x768BE13e1680b5EbE0024C42c896E3dB59ec0149/logo.png"
              alt="RATCHET"
              className="buy-token-logo"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
            <div className="buy-token-name">$RATCHET</div>
            <div className="buy-token-price">{loading ? '...' : formatPrice(ratchetPrice)}</div>
            <button className="btn btn-primary" onClick={buyRatchet}>Buy $RATCHET</button>
          </div>
          <div className="buy-token-card">
            <img
              src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x60c39541540E49a18E4C591C74B3487B4CD2aA27/logo.png"
              alt="ABC"
              className="buy-token-logo"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
            <div className="buy-token-name">$ABC</div>
            <div className="buy-token-price">{loading ? '...' : formatPrice(abcPrice)}</div>
            <button className="btn btn-primary" onClick={buyAbc}>Buy $ABC</button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
