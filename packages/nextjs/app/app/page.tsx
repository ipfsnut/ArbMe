'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { fetchPoolsByToken } from '@/services/api'
import { buildTradeHref, dexToVersion } from '@/utils/trade-links'
import { buyArbme } from '@/lib/actions'
import { useAppState } from '@/store/AppContext'
import { formatPrice } from '@/utils/format'
import type { Pool } from '@/utils/types'

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

export default function AppPage() {
  const { state } = useAppState()
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)

  const arbmePrice = typeof state.globalStats?.arbmePrice === 'number'
    ? state.globalStats.arbmePrice
    : parseFloat(state.globalStats?.arbmePrice || '0') || 0

  useEffect(() => {
    Promise.all([
      fetchPoolsByToken('arbme').catch(() => ({ pools: [] })),
      fetchPoolsByToken('chaos').catch(() => ({ pools: [] })),
      fetchPoolsByToken('ratchet').catch(() => ({ pools: [] })),
    ]).then(([arbme, chaos, ratchet]) => {
      const all = [...arbme.pools, ...chaos.pools, ...ratchet.pools]
        .filter(p => p.tvl > 1)
      // Deduplicate by pool address (a pool may appear in multiple token feeds)
      const seen = new Set<string>()
      const unique = all.filter(p => {
        const key = p.pairAddress.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      unique.sort((a, b) => b.tvl - a.tvl)
      setPools(unique)
      setLoading(false)
    })
  }, [])

  const topPools = useMemo(() => pools.slice(0, 10), [pools])

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
          <div className="trade-pool-list">
            {topPools.map((pool) => {
              const tradeHref = buildTradeHref(pool)
              const version = dexToVersion(pool.dex) || pool.dex
              const changeClass = pool.priceChange24h >= 0 ? 'positive' : 'negative'
              const changeSign = pool.priceChange24h >= 0 ? '+' : ''

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
        )}
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
            <div className="buy-token-price">{state.globalStats ? formatPrice(arbmePrice) : '...'}</div>
            <button className="btn btn-primary" onClick={buyArbme}>Swap</button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
