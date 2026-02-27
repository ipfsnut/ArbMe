'use client'

import { useState } from 'react'
import { useAppState } from '@/store/AppContext'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import PoolsWidget from '@/components/PoolsWidget'
import { formatPrice } from '@/utils/format'
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
