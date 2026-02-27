'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { fetchPoolsByToken } from '@/services/api'
import type { Pool } from '@/utils/types'
import { buildTradeHref, dexToVersion } from '@/utils/trade-links'

type SortKey = 'tvl' | 'volume' | 'heat' | 'change'

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

interface TokenLeaderboardProps {
  token: 'arbme' | 'chaos' | 'ratchet'
  limit?: number
}

export function TokenLeaderboard({ token, limit = 15 }: TokenLeaderboardProps) {
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('tvl')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchPoolsByToken(token)
      .then((data) => {
        setPools(data.pools)
      })
      .catch((err) => {
        console.error(`[TokenLeaderboard] Failed to fetch ${token} pools:`, err)
        setError(`Failed to load ${token.toUpperCase()} pools`)
      })
      .finally(() => setLoading(false))
  }, [token])

  const filtered = useMemo(() => {
    let result = pools.filter(p => p.tvl > 1)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.pair.toLowerCase().includes(q) ||
        p.pairAddress.toLowerCase().includes(q)
      )
    }

    result.sort((a, b) => {
      switch (sortKey) {
        case 'tvl': return b.tvl - a.tvl
        case 'volume': return b.volume24h - a.volume24h
        case 'heat': {
          const heatA = a.tvl > 0 ? a.volume24h / a.tvl : 0
          const heatB = b.tvl > 0 ? b.volume24h / b.tvl : 0
          return heatB - heatA
        }
        case 'change': return b.priceChange24h - a.priceChange24h
        default: return 0
      }
    })

    if (!showAll && result.length > limit) {
      return result.slice(0, limit)
    }
    return result
  }, [pools, search, sortKey, showAll, limit])

  const totalCount = pools.filter(p => p.tvl > 1).length

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <p>Loading pools...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error-state">
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="token-leaderboard">
      <div className="leaderboard-controls">
        <input
          type="text"
          className="leaderboard-search"
          placeholder="Search pairs or addresses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="leaderboard-sort-buttons">
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
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>No pools found{search ? ` for "${search}"` : ''}</p>
        </div>
      ) : (
        <>
          <div className="trade-pool-list">
            {filtered.map((pool) => {
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
                    {pool.fee && (
                      <div className="trade-pool-stat">
                        <span className="trade-stat-label">Fee</span>
                        <span className="trade-stat-value">{(pool.fee / 10000).toFixed(2)}%</span>
                      </div>
                    )}
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
                  <span className="trade-external-badge">External</span>
                </a>
              )
            })}
          </div>

          {totalCount > limit && !showAll && (
            <button
              className="leaderboard-show-all"
              onClick={() => setShowAll(true)}
            >
              Show all {totalCount} pools
            </button>
          )}
          {showAll && totalCount > limit && (
            <button
              className="leaderboard-show-all"
              onClick={() => setShowAll(false)}
            >
              Show top {limit}
            </button>
          )}
        </>
      )}
    </div>
  )
}
