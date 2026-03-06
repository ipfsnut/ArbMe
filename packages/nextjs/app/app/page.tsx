'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { fetchPoolsByToken } from '@/services/api'
import { buildTradeHref, dexToVersion } from '@/utils/trade-links'
import { buyArbme, buyChaos, buyRatchet } from '@/lib/actions'
import { useAppState } from '@/store/AppContext'
import { useIsFarcaster } from '@/hooks/useWallet'
import { formatPrice } from '@/utils/format'
import type { Pool } from '@/utils/types'

type SortKey = 'tvl' | 'volume' | 'heat' | 'change'

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

// Main pool addresses for browser swap links
const MAIN_POOLS = {
  arbme: '/trade/0x269bbee1e347ab5092e9cEAbc593c6239eE0B016?t0=0x4200000000000000000000000000000000000006&t1=0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07&v=V3&fee=10000&ts=200&pair=WETH/ARBME',
  chaos: 'https://www.flaunch.gg/base/coin/0x8454d062506a27675706148ecdd194e45e44067a',
  ratchet: '/trade/0x5058a53f05fa65e0bab7cf9a1bfb978b1b099307?t0=0x4200000000000000000000000000000000000006&t1=0x392bc5deea227043d69af0e67badcbbaed511b07&v=V3&fee=10000&ts=200&pair=WETH/RATCHET',
}

export default function AppPage() {
  const { state } = useAppState()
  const isFarcaster = useIsFarcaster()
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('tvl')

  const arbmePrice = typeof state.globalStats?.arbmePrice === 'number'
    ? state.globalStats.arbmePrice
    : parseFloat(state.globalStats?.arbmePrice || '0') || 0
  const chaosPrice = state.globalStats?.chaosPrice
    ? (typeof state.globalStats.chaosPrice === 'number' ? state.globalStats.chaosPrice : parseFloat(state.globalStats.chaosPrice) || 0)
    : 0
  const ratchetPrice = state.globalStats?.ratchetPrice
    ? (typeof state.globalStats.ratchetPrice === 'number' ? state.globalStats.ratchetPrice : parseFloat(state.globalStats.ratchetPrice) || 0)
    : 0

  useEffect(() => {
    Promise.all([
      fetchPoolsByToken('arbme').catch(() => ({ pools: [] })),
      fetchPoolsByToken('chaos').catch(() => ({ pools: [] })),
      fetchPoolsByToken('ratchet').catch(() => ({ pools: [] })),
    ]).then(([arbme, chaos, ratchet]) => {
      const all = [...arbme.pools, ...chaos.pools, ...ratchet.pools]
        .filter(p => p.tvl > 1)
      const seen = new Set<string>()
      const unique = all.filter(p => {
        const key = p.pairAddress.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setPools(unique)
      setLoading(false)
    })
  }, [])

  const topPools = useMemo(() => {
    const sorted = [...pools]
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'tvl': return b.tvl - a.tvl
        case 'volume': return b.volume24h - a.volume24h
        case 'heat': {
          const hA = a.tvl > 0 ? a.volume24h / a.tvl : 0
          const hB = b.tvl > 0 ? b.volume24h / b.tvl : 0
          return hB - hA
        }
        case 'change': return b.priceChange24h - a.priceChange24h
        default: return 0
      }
    })
    return sorted.slice(0, 10)
  }, [pools, sortKey])

  const pricesLoaded = !!state.globalStats

  const handleSwap = (token: 'arbme' | 'chaos' | 'ratchet') => {
    if (isFarcaster) {
      if (token === 'arbme') buyArbme()
      else if (token === 'chaos') buyChaos()
      else buyRatchet()
    } else {
      window.open(MAIN_POOLS[token], token === 'chaos' ? '_blank' : '_self')
    }
  }

  return (
    <div className="app">
      <AppHeader />

      {/* Top Pools Section */}
      <div className="featured-section">
        <h2 className="section-title">Top Pools</h2>
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading pools...</p>
          </div>
        ) : topPools.length === 0 ? (
          <div className="empty-state">
            <p>No pools found</p>
          </div>
        ) : (
          <>
            <div className="leaderboard-sort-buttons" style={{ marginBottom: 'var(--spacing-md)' }}>
              {([
                ['tvl', 'TVL'],
                ['volume', 'Volume'],
                ['heat', 'Heat'],
                ['change', '24h%'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  className={`leaderboard-sort-btn ${sortKey === key ? 'active' : ''}`}
                  onClick={() => setSortKey(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="trade-pool-list">
              {topPools.map((pool) => {
                const tradeHref = buildTradeHref(pool)
                const version = dexToVersion(pool.dex) || pool.dex
                const changeClass = pool.priceChange24h >= 0 ? 'positive' : 'negative'
                const changeSign = pool.priceChange24h >= 0 ? '+' : ''
                const heat = pool.tvl > 0 ? (pool.volume24h / pool.tvl) * 100 : 0

                const card = (
                  <div className="trade-pool-card">
                    <div className="trade-pool-top">
                      <span className="trade-pool-pair">{pool.pair}</span>
                      <span className={`version-badge ${typeof version === 'string' ? version.toLowerCase() : ''}`}>{version}</span>
                    </div>
                    <div className="trade-pool-stats">
                      <div className="trade-pool-stat">
                        <span className="trade-stat-label">TVL</span>
                        <span className="trade-stat-value">{formatUsd(pool.tvl)}</span>
                      </div>
                      <div className="trade-pool-stat">
                        <span className="trade-stat-label">24h Vol</span>
                        <span className="trade-stat-value">{formatUsd(pool.volume24h)}</span>
                      </div>
                      <div className="trade-pool-stat">
                        <span className="trade-stat-label">Heat</span>
                        <span className="trade-stat-value">{heat.toFixed(0)}%</span>
                      </div>
                      <div className="trade-pool-stat">
                        <span className="trade-stat-label">24h</span>
                        <span className={`trade-stat-value ${changeClass}`}>
                          {changeSign}{pool.priceChange24h.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )

                if (tradeHref) {
                  return (
                    <Link key={pool.pairAddress} href={tradeHref} className="trade-pool-link">
                      {card}
                    </Link>
                  )
                }

                return (
                  <a
                    key={pool.pairAddress}
                    href={pool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="trade-pool-link"
                  >
                    {card}
                  </a>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Swap Section — All 3 ecosystem tokens */}
      <div className="buy-tokens-section">
        <div className="buy-tokens-grid">
          <div className="buy-token-card">
            <img src="/arbie.png" alt="ARBME" className="buy-token-logo" />
            <div className="buy-token-name">$ARBME</div>
            <div className="buy-token-price">{pricesLoaded ? formatPrice(arbmePrice) : '...'}</div>
            <button className="btn btn-primary" onClick={() => handleSwap('arbme')}>Swap</button>
          </div>
          <div className="buy-token-card">
            <div className="buy-token-logo-text">C</div>
            <div className="buy-token-name">$CHAOSLP</div>
            <div className="buy-token-price">{pricesLoaded ? formatPrice(chaosPrice) : '...'}</div>
            <button className="btn btn-primary" onClick={() => handleSwap('chaos')}>Swap</button>
          </div>
          <div className="buy-token-card">
            <div className="buy-token-logo-text">R</div>
            <div className="buy-token-name">$RATCHET</div>
            <div className="buy-token-price">{pricesLoaded ? formatPrice(ratchetPrice) : '...'}</div>
            <button className="btn btn-primary" onClick={() => handleSwap('ratchet')}>Swap</button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
