'use client'

import { useAppState } from '@/store/AppContext'
import { formatArbmeMarketCap, formatUsd, formatPrice } from '@/utils/format'
import { buyArbme, sendTip } from '@/lib/actions'
import Image from 'next/image'

export function AppHeader() {
  const { state } = useAppState()
  const { globalStats } = state

  const marketCapDisplay = globalStats
    ? formatArbmeMarketCap(globalStats.arbmePrice)
    : '...'

  const tvlDisplay = globalStats
    ? formatUsd(globalStats.totalTvl)
    : '...'

  const priceDisplay = globalStats
    ? formatPrice(globalStats.arbmePrice)
    : '...'

  return (
    <header className="app-header">
      <div className="app-header-top">
        <div className="app-logo">
          <img src="/arbie.png" alt="ArbMe" className="logo-image" />
          <div>
            <h1>ArbMe</h1>
            <p className="text-secondary">Permissionless Arb Routes</p>
          </div>
        </div>
        <button
          onClick={() => sendTip('1')}
          className="tip-jar-button"
          title="Send 1 $ARBME tip"
        >
          💝
        </button>
      </div>

      <div className="stats-banner">
        <div className="stat-item">
          <span className="stat-label text-secondary">Market Cap</span>
          <span className="stat-value text-accent">{marketCapDisplay}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label text-secondary">Total TVL</span>
          <span className="stat-value">{tvlDisplay}</span>
        </div>
      </div>

      <div className="arbme-price-display">
        <span className="price-label text-secondary">$ARBME Price</span>
        <span className="price-value">{priceDisplay}</span>
        <button onClick={buyArbme} className="buy-arbme-btn">
          Buy $ARBME
        </button>
      </div>
    </header>
  )
}
