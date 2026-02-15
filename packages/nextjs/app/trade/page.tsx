'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { fetchPools } from '@/services/api'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { ROUTES } from '@/utils/constants'
import type { Pool, PoolsResponse } from '@/utils/types'

// Map token symbols to addresses (lowercase) for trade link construction
const SYMBOL_TO_ADDRESS: Record<string, string> = {
  'ARBME': '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07',
  '$ARBME': '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07',
  'RATCHET': '0x392bc5deea227043d69af0e67badcbbaed511b07',
  '$RATCHET': '0x392bc5deea227043d69af0e67badcbbaed511b07',
  'CHAOS': '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292',
  '$CHAOS': '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292',
  'ABC': '0x5c0872b790bb73e2b3a9778db6e7704095624b07',
  'ALPHACLAW': '0x8c19a8b92fa406ae097eb9ea8a4a44cbc10eafe2',
  'MLTL': '0xa448d40f6793773938a6b7427091c35676899125',
  'MOLT': '0xb695559b26bb2c9703ef1935c37aeae9526bab07',
  'CLANKER': '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb',
  'BNKR': '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b',
  'CLAWD': '0x53ad48291407e16e29822deb505b30d47f965ebb',
  'OPENCLAW': '0xf3bb567d4c79cb32d92b9db151255cdd3b91f04a',
  'WOLF': '0xc3a366c03a0fc57d96065e3adb27dd0036d83b80',
  'EDGE': '0x1966a17d806a79f742e6e228ecc9421f401a8a32',
  'OSO': '0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e',
  'CNEWS': '0x01de044ad8eb037334ddda97a38bb0c798e4eb07',
  'PAGE': '0xc4730f86d1f86ce0712a7b17ee919db7defad7fe',
  'USDC': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  'WETH': '0x4200000000000000000000000000000000000006',
  'flETH': '0x000000000d564d5be76f7f0d28fe52605afc7cf8',
}

function dexToVersion(dex: string): 'V2' | 'V3' | 'V4' {
  if (dex.includes('v4') || dex.includes('V4')) return 'V4'
  if (dex.includes('v3') || dex.includes('V3')) return 'V3'
  return 'V2'
}

function buildTradeHref(pool: Pool): string | null {
  const version = dexToVersion(pool.dex)

  // Try to resolve token addresses from pool data or symbol mapping
  const parts = pool.pair.split('/').map(s => s.trim())
  if (parts.length !== 2) return null

  const t0 = pool.token0 || SYMBOL_TO_ADDRESS[parts[0].toUpperCase()] || SYMBOL_TO_ADDRESS[parts[0]]
  const t1 = pool.token1 || SYMBOL_TO_ADDRESS[parts[1].toUpperCase()] || SYMBOL_TO_ADDRESS[parts[1]]

  if (!t0 || !t1) return null

  const fee = pool.fee || 3000
  // Derive tick spacing from fee for V4
  let ts = 60
  if (fee <= 500) ts = 10
  else if (fee <= 3000) ts = 60
  else if (fee <= 10000) ts = 200
  else ts = 200

  const params = new URLSearchParams({
    t0,
    t1,
    v: version,
    fee: fee.toString(),
    ts: ts.toString(),
    pair: pool.pair,
  })

  return `/trade/${pool.pairAddress}?${params.toString()}`
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

export default function TradeIndexPage() {
  const [data, setData] = useState<PoolsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'arbme' | 'ratchet'>('all')

  useEffect(() => {
    fetchPools()
      .then(setData)
      .catch((err) => {
        console.error('[Trade] Failed to fetch pools:', err)
        setError('Failed to load pools')
      })
      .finally(() => setLoading(false))
  }, [])

  const pools = useMemo(() => {
    if (!data?.pools) return []

    let filtered = data.pools.filter(p => p.tvl > 1)

    if (filter === 'arbme') {
      filtered = filtered.filter(p => p.pair.toUpperCase().includes('ARBME'))
    } else if (filter === 'ratchet') {
      filtered = filtered.filter(p => p.pair.toUpperCase().includes('RATCHET'))
    }

    // Sort by TVL descending
    return filtered.sort((a, b) => b.tvl - a.tvl)
  }, [data, filter])

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back" />

        <div className="page-header">
          <h1 style={{ fontFamily: 'var(--font-mono)' }}>Trade</h1>
          <p className="page-subtitle">Swap tokens in any pool</p>
        </div>

        {/* Filter */}
        <div className="trade-filters">
          {(['all', 'arbme', 'ratchet'] as const).map((f) => (
            <button
              key={f}
              className={`trade-filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All Pools' : f === 'arbme' ? 'ARBME' : 'RATCHET'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading pools...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
          </div>
        ) : pools.length === 0 ? (
          <div className="empty-state">
            <p>No pools found</p>
          </div>
        ) : (
          <div className="trade-pool-list">
            {pools.map((pool) => {
              const tradeHref = buildTradeHref(pool)
              const version = dexToVersion(pool.dex)
              const changeClass = pool.priceChange24h >= 0 ? 'positive' : 'negative'
              const changeSign = pool.priceChange24h >= 0 ? '+' : ''

              const card = (
                <div className="trade-pool-card">
                  <div className="trade-pool-top">
                    <span className="trade-pool-pair">{pool.pair}</span>
                    <span className={`version-badge ${version.toLowerCase()}`}>{version}</span>
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

              // Fallback: link to external DEX
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
        )}
      </div>

      <Footer />
    </div>
  )
}
