'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { fetchPools } from '@/services/api'
import { buildTradeHref } from '@/utils/trade-links'
import type { PoolsResponse } from '@/utils/types'

const ARBME_ADDRESS = '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07'

export default function LandingPageClient({ initialData }: { initialData?: PoolsResponse }) {
  const [data, setData] = useState<PoolsResponse | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetchPools()
        setData(response)
      } catch (err) {
        console.error('[Landing] Failed to load data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const arbmePrice = data?.arbmePrice ? parseFloat(data.arbmePrice) : 0
  const totalTvl = data?.totalTvl || 0
  const arbmeTvl = data?.arbmeTvl || 0
  const poolCount = data?.poolCount || 0

  // Get top pools by 24h volume (rewards active pools)
  const topPools = data?.pools
    ?.filter(p => p.pair.toUpperCase().includes('ARBME'))
    ?.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    ?.slice(0, 6) || []

  const formatUsd = (value: number): string => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
    if (value >= 1) return `$${value.toFixed(2)}`
    if (value > 0) return `$${value.toFixed(4)}`
    return '$0'
  }

  const formatPrice = (value: number): string => {
    if (value >= 1) return `$${value.toFixed(4)}`
    if (value >= 0.0001) return `$${value.toFixed(6)}`
    return `$${value.toFixed(8)}`
  }

  const formatDex = (dex: string): string => {
    const names: Record<string, string> = {
      'uniswap_v2': 'Uniswap V2',
      'uniswap_v3': 'Uniswap V3',
      'uniswap_v4': 'Uniswap V4',
      'aerodrome': 'Aerodrome',
      'balancer_v3': 'Balancer V3',
    }
    return names[dex] || dex
  }

  return (
    <div className="lp">
      {/* Gradient Background */}
      <div className="lp-gradient-bg" />

      {/* Fixed Nav */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-nav-logo">
            <Image src="/arbie.png" alt="Arbie" width={24} height={24} />
            $ARBME
          </div>
          <div className="lp-nav-links">
            <a href="#how">How It Works</a>
            <a href="#pools">Pools</a>
            <a href="#agent">Agent API</a>
            <Link href="/app" className="lp-nav-cta">Launch App</Link>
          </div>
        </div>
      </nav>

      <div className="lp-content">
        {/* Hero */}
        <header className="lp-hero">
          <Image
            src="/arbie.png"
            alt="Arbie the mascot"
            width={180}
            height={180}
            className="lp-hero-mascot"
          />
          <h1 className="lp-hero-title">ArbMe</h1>
          <div className="lp-hero-tagline">
            Capture Volatility. Earn From Every Trade.
          </div>
          <p className="lp-hero-subtitle">
            An ERC20 token that pairs with other tokens to create arb routes.
            No deals. No permission. Just LP.
          </p>
          <p className="lp-hero-desc">
            ARBME sits in the middle, connecting pools into a mesh of routes.
            Value tracks volume and pair selection.
          </p>
          <div className="lp-hero-cta">
            <a
              href={`https://app.uniswap.org/swap?outputCurrency=${ARBME_ADDRESS}&chain=base`}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn lp-btn-primary"
            >
              Buy $ARBME
            </a>
            <a href="#how" className="lp-btn lp-btn-ghost">
              How It Works
            </a>
          </div>

          {/* Live Stats */}
          <div className="lp-hero-stats">
            <div className="lp-hero-stat">
              <span className="lp-hero-stat-value">{loading ? '...' : formatPrice(arbmePrice)}</span>
              <span className="lp-hero-stat-label">$ARBME Price</span>
            </div>
            <div className="lp-hero-stat">
              <span className="lp-hero-stat-value">{loading ? '...' : formatUsd(arbmeTvl)}</span>
              <span className="lp-hero-stat-label">Total TVL</span>
            </div>
            <div className="lp-hero-stat">
              <span className="lp-hero-stat-value">{loading ? '...' : poolCount}</span>
              <span className="lp-hero-stat-label">Active Pools</span>
            </div>
          </div>
        </header>

        {/* Statement */}
        <div className="lp-statement">
          <div className="lp-speech-bubble">
            <p>
              Most tokens hate getting arbed. <strong>$ARBME embraces it.</strong><br />
              More LPers → more pools → more routes → more fees. No gatekeepers.
            </p>
          </div>
        </div>

        {/* How It Works */}
        <section id="how" className="lp-section">
          <div className="lp-section-label">The Basics</div>
          <h2 className="lp-section-title">How ArbMe Works</h2>
          <p className="lp-section-desc">
            $ARBME sits between trading pairs. When prices diverge, arbers route through
            to capture the difference. LPers provide the liquidity. Fees flow.
          </p>

          <div className="lp-how-box">
            <div className="lp-how-flow">
              <span className="lp-flow-step">Token pumps</span>
              <span className="lp-flow-arrow">→</span>
              <span className="lp-flow-step">ARBME pool has cheap tokens</span>
              <span className="lp-flow-arrow">→</span>
              <span className="lp-flow-step">Arber routes through</span>
              <span className="lp-flow-arrow">→</span>
              <span className="lp-flow-step">Fees generated</span>
            </div>
            <p>
              Every pool connected to $ARBME creates routes to every other pool.
              5 pools = 10 routes. The mesh compounds.
            </p>
          </div>
        </section>

        {/* Two-Sided Market */}
        <section className="lp-section">
          <div className="lp-section-label">Two-Sided Market</div>
          <h2 className="lp-section-title">LPers & Arbers</h2>
          <p className="lp-section-desc">
            A decentralized protocol where two groups coordinate without intermediaries.
          </p>

          <div className="lp-personas">
            <div className="lp-persona lp-persona-lper">
              <div className="lp-persona-icon">🌊</div>
              <h3>LPers</h3>
              <div className="lp-persona-role">Provide liquidity, earn fees</div>
              <p>
                See a token that needs liquidity? Just create a pool. No proposals,
                no waiting, no permission.
              </p>
              <ul>
                <li>Permissionless pool creation</li>
                <li>Pick your pairs, set your exposure</li>
                <li>No lockups, withdraw anytime</li>
              </ul>
            </div>
            <div className="lp-persona lp-persona-arber">
              <div className="lp-persona-icon">⚡</div>
              <h3>Arbers</h3>
              <div className="lp-persona-role">Find deals, extract profit</div>
              <p>
                You want cheap tokens, fast. $ARBME pools lag behind main DEX during
                spikes. That&apos;s your edge.
              </p>
              <ul>
                <li>Mispriced pools during volatility</li>
                <li>Multiple routes through the mesh</li>
                <li>Cheap gas on Base (~$0.01)</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Live Pools */}
        <section id="pools" className="lp-section">
          <div className="lp-pools-header">
            <div>
              <div className="lp-section-label">Live Pools</div>
              <h2 className="lp-section-title">The Mesh</h2>
            </div>
            <div className="lp-pools-stats">
              <div className="lp-pools-stat">
                <span className="lp-pools-stat-value">{loading ? '-' : poolCount}</span>
                <span className="lp-pools-stat-label">Pools</span>
              </div>
              <div className="lp-pools-stat">
                <span className="lp-pools-stat-value">{loading ? '-' : formatUsd(totalTvl)}</span>
                <span className="lp-pools-stat-label">Total TVL</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="lp-pools-loading">Loading pools...</div>
          ) : topPools.length > 0 ? (
            <table className="lp-pools-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>DEX</th>
                  <th>TVL</th>
                  <th>24h Volume ↓</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {topPools.map((pool) => {
                  const tradeHref = buildTradeHref(pool);
                  return (
                    <tr key={pool.pairAddress}>
                      <td className="lp-pool-pair">{pool.pair}</td>
                      <td className="lp-pool-dex">{formatDex(pool.dex)}</td>
                      <td className="lp-pool-tvl">{formatUsd(pool.tvl)}</td>
                      <td className="lp-pool-volume">{formatUsd(pool.volume24h || 0)}</td>
                      <td>
                        {tradeHref ? (
                          <Link href={tradeHref} className="lp-pool-link">
                            Trade
                          </Link>
                        ) : (
                          <a href={pool.url} target="_blank" rel="noopener noreferrer" className="lp-pool-link">
                            Chart
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="lp-pools-loading">No pools found yet. Be the first to LP!</div>
          )}

          <div className="lp-pools-cta">
            <Link href="/app" className="lp-btn lp-btn-ghost">
              View All Pools in App →
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className="lp-cta-section">
          <Image src="/arbie.png" alt="Arbie" width={100} height={100} className="lp-cta-mascot" />
          <h2 className="lp-cta-title">Join the Mesh</h2>
          <p className="lp-cta-desc">
            LP to earn fees. Arb to profit. Build routes together.
          </p>
          <div className="lp-cta-buttons">
            <a
              href={`https://app.uniswap.org/swap?outputCurrency=${ARBME_ADDRESS}&chain=base`}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn lp-btn-primary"
            >
              Buy $ARBME
            </a>
            <a
              href={`https://basescan.org/token/${ARBME_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn lp-btn-ghost"
            >
              BaseScan
            </a>
            <a
              href="https://dexscreener.com/base/0x6afd39b7114a0892d10ffaae2eefcc16777dd376273c25d9d4f3a1a065131b83"
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn lp-btn-ghost"
            >
              DexScreener
            </a>
          </div>
        </section>

        {/* Agent Interface */}
        <section id="agent" className="lp-section">
          <div className="lp-section-label">Machine-Readable</div>
          <h2 className="lp-section-title">Agent API</h2>
          <p className="lp-section-desc">
            Contracts, endpoints, and MCP tools for AI agents and programmatic access.
          </p>

          <div className="lp-agent-block">
            <div className="lp-agent-heading">Contracts (Base L2, Chain ID: 8453)</div>
            <pre className="lp-agent-pre">{`ARBME_TOKEN         = 0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07
WETH                = 0x4200000000000000000000000000000000000006
USDC                = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
V4_POOL_MANAGER     = 0x498581ff718922c3f8e6a244956af099b2652b2b
V4_POSITION_MANAGER = 0x7c5f5a4bbd8fd63184577525326123b519429bdc
V4_QUOTER           = 0x0d5e0f971ed27fbff6c2837bf31316121532048d
V3_QUOTER           = 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a
V3_POSITION_MANAGER = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
V2_ROUTER           = 0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24
CLANKER_HOOK_V2     = 0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC
CLANKER_HOOK_V1     = 0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC
PERMIT2             = 0x000000000022D473030F116dDEE9F6B43aC78BA3
RATCHET_STAKING     = 0x9Bf5fc3C400c619B9c73CE4D4c847c4707baE5E7`}</pre>
          </div>

          <div className="lp-agent-block">
            <div className="lp-agent-heading">API Endpoints (Base URL: https://arbme.epicdylan.com)</div>
            <pre className="lp-agent-pre">{`GET  /api/pools             — all pools with prices, TVL, volume
POST /api/quote             — swap quote with price impact (V2/V3/V4)
POST /api/swap              — build swap transaction
GET  /api/positions         — LP positions for a wallet
POST /api/build-create-pool — build pool creation + mint transactions
POST /api/check-pool-exists — check if pool exists on-chain
GET  /api/token-info        — token metadata (symbol, decimals)
GET  /api/token-price       — token price from GeckoTerminal
GET  /api/staking/info      — RATCHET staking info (total staked, APR)

Full reference (29 routes): /llms-full.txt`}</pre>
          </div>

          <div className="lp-agent-block">
            <div className="lp-agent-heading">MCP Server (10 tools)</div>
            <pre className="lp-agent-pre">{`Clanker News:
  clanker_news_feed         — fetch front page posts with votes
  clanker_news_post         — submit a new post
  clanker_news_comment      — comment on a post
  clanker_news_check_replies — check replies for agent

Farcaster:
  farcaster_crosspost       — crosspost headlines to Farcaster
  farcaster_notifications   — read notifications and mentions

DeFi:
  arbme_get_pools           — fetch pools with TVL, volume, pricing
  arbme_get_quote           — swap quote with price impact
  arbme_check_balances      — check ETH + token balances
  arbme_find_arb            — find arbitrage opportunities`}</pre>
          </div>

          <div className="lp-agent-block">
            <div className="lp-agent-heading">MCP Configuration (.mcp.json)</div>
            <pre className="lp-agent-pre">{`{
  "mcpServers": {
    "arbme": {
      "command": "node",
      "args": ["packages/mcp-server/build/index.js"],
      "env": {
        "CN_AGENT_PRIVATE_KEY": "",
        "NEYNAR_API_KEY": "",
        "NEYNAR_SIGNER_UUID": "",
        "NEYNAR_FID": "",
        "ARBME_PRIVATE_KEY": "",
        "BASE_RPC_URL": ""
      }
    }
  }
}`}</pre>
          </div>

          <div className="lp-agent-block">
            <div className="lp-agent-heading">Ecosystem Tokens</div>
            <pre className="lp-agent-pre">{`ARBME    = 0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07
RATCHET  = 0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07
ABC      = 0x5c0872b790Bb73e2B3A9778Db6E7704095624b07
ALPHACLAW = 0x8C19A8b92FA406Ae097EB9eA8a4A44cBC10EafE2
CHAOSLP  = 0x8454d062506a27675706148ecdd194e45e44067a
PAGE     = 0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE`}</pre>
          </div>

          <div className="lp-agent-block">
            <div className="lp-agent-heading">Links</div>
            <pre className="lp-agent-pre">{`llms.txt:          https://arbme.epicdylan.com/llms.txt
llms-full.txt:     https://arbme.epicdylan.com/llms-full.txt
ChaosLP:           https://chaos-theory.epicdylan.com
BaseScan (ARBME):  https://basescan.org/token/0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07
DexScreener:       https://dexscreener.com/base/0x6afd39b7114a0892d10ffaae2eefcc16777dd376273c25d9d4f3a1a065131b83`}</pre>
          </div>
        </section>

        {/* Footer */}
        <footer className="lp-footer">
          <div className="lp-footer-inner">
            <div>
              <div className="lp-footer-brand">$ARBME</div>
              <div className="lp-footer-tagline">Decentralized Arbitrage Protocol</div>
            </div>
            <div className="lp-footer-ca">
              CA: <span>{ARBME_ADDRESS}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
