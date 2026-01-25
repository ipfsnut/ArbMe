'use client'

import { useState, useEffect } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { ROUTES } from '@/utils/constants'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/app/api'

interface RacePool {
  positionId: string
  token0: { symbol: string; address: string }
  token1: { symbol: string; address: string }
  fee: number
  volume24h: number
  swapCount24h: number
  poolId: string
  rank: number
  volumeSource: 'on-chain' | 'gecko' | 'unavailable'
}

interface RaceData {
  pools: RacePool[]
  raceEndTime: number
  lastUpdated: number
  metric: string
  source: string
}

function formatTimeRemaining(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }

  const seconds = Math.floor((ms / 1000) % 60)
  const minutes = Math.floor((ms / (1000 * 60)) % 60)
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))

  return { days, hours, minutes, seconds }
}

function formatUsd(value: number): string {
  if (value < 0.01) return '<$0.01'
  if (value < 1000) return `$${value.toFixed(2)}`
  if (value < 1000000) return `$${(value / 1000).toFixed(2)}K`
  return `$${(value / 1000000).toFixed(2)}M`
}

function RankBadge({ rank }: { rank: number }) {
  const medals: Record<number, { emoji: string; color: string }> = {
    1: { emoji: '🥇', color: '#FFD700' },
    2: { emoji: '🥈', color: '#C0C0C0' },
    3: { emoji: '🥉', color: '#CD7F32' },
  }

  const medal = medals[rank]

  if (medal) {
    return (
      <span className="rank-badge medal" style={{ color: medal.color }}>
        {medal.emoji}
      </span>
    )
  }

  return <span className="rank-badge">{rank}</span>
}

export default function TheGreat20RacePage() {
  const [raceData, setRaceData] = useState<RaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<ReturnType<typeof formatTimeRemaining>>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  })
  const [raceEnded, setRaceEnded] = useState(false)

  // Fetch race data
  useEffect(() => {
    async function fetchRaceData() {
      try {
        setLoading(true)
        const res = await fetch(`${API_BASE}/race-pools`)
        if (!res.ok) throw new Error('Failed to fetch race data')
        const data = await res.json()
        setRaceData(data)

        // Check if race has ended
        if (Date.now() >= data.raceEndTime) {
          setRaceEnded(true)
        }
      } catch (err: any) {
        console.error('[Race] Error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchRaceData()

    // Refresh every 30 seconds
    const interval = setInterval(fetchRaceData, 30000)
    return () => clearInterval(interval)
  }, [])

  // Update countdown
  useEffect(() => {
    if (!raceData) return

    const updateCountdown = () => {
      const remaining = raceData.raceEndTime - Date.now()
      if (remaining <= 0) {
        setRaceEnded(true)
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 })
      } else {
        setTimeRemaining(formatTimeRemaining(remaining))
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [raceData])

  const winner = raceData?.pools[0]

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back to Home" />

        <div className="race-header">
          <h1 className="race-title">
            <span className="race-emoji">🏁</span>
            The Great $20 Race
            <span className="race-emoji">🏁</span>
          </h1>
          <p className="race-subtitle">
            8 pools. $20 each. Most 24h volume wins... nothing but glory!
          </p>
        </div>

        {/* Countdown Timer */}
        <div className="countdown-container">
          {raceEnded ? (
            <div className="race-ended">
              <span className="trophy">🏆</span>
              <h2>Race Complete!</h2>
              {winner && (
                <p className="winner-announcement">
                  Winner: <strong>{winner.token0.symbol} / {winner.token1.symbol}</strong>
                  <br />
                  Final 24h Volume: {formatUsd(winner.volume24h)}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="countdown-label">Time Remaining</div>
              <div className="countdown-timer">
                <div className="countdown-unit">
                  <span className="countdown-value">{timeRemaining.days}</span>
                  <span className="countdown-label-small">days</span>
                </div>
                <span className="countdown-separator">:</span>
                <div className="countdown-unit">
                  <span className="countdown-value">{String(timeRemaining.hours).padStart(2, '0')}</span>
                  <span className="countdown-label-small">hrs</span>
                </div>
                <span className="countdown-separator">:</span>
                <div className="countdown-unit">
                  <span className="countdown-value">{String(timeRemaining.minutes).padStart(2, '0')}</span>
                  <span className="countdown-label-small">min</span>
                </div>
                <span className="countdown-separator">:</span>
                <div className="countdown-unit">
                  <span className="countdown-value">{String(timeRemaining.seconds).padStart(2, '0')}</span>
                  <span className="countdown-label-small">sec</span>
                </div>
              </div>
              <div className="countdown-end-date">
                Ends: Saturday, February 1, 2026 at Midnight UTC
              </div>
            </>
          )}
        </div>

        {/* Leaderboard */}
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading race standings...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : raceData ? (
          <div className="race-leaderboard">
            <h2 className="leaderboard-title">Current Standings</h2>

            <div className="leaderboard-list">
              {raceData.pools.map((pool) => (
                <div
                  key={pool.positionId}
                  className={`leaderboard-row ${pool.rank <= 3 ? `top-${pool.rank}` : ''}`}
                >
                  <div className="leaderboard-rank">
                    <RankBadge rank={pool.rank} />
                  </div>

                  <div className="leaderboard-pool">
                    <span className="pool-pair">
                      {pool.token0.symbol} / {pool.token1.symbol}
                    </span>
                    <span className="pool-fee">
                      {(pool.fee / 10000).toFixed(2)}% fee
                    </span>
                  </div>

                  <div className="leaderboard-stats">
                    <div className="leaderboard-volume">
                      <span className="volume-value">{formatUsd(pool.volume24h)}</span>
                      <span className="volume-label">24h Vol</span>
                    </div>
                    <div className="leaderboard-swaps">
                      <span className="swaps-value">{pool.swapCount24h || 0}</span>
                      <span className="swaps-label">swaps</span>
                    </div>
                  </div>

                  <a
                    href={`https://app.uniswap.org/positions/v4/base/${pool.positionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="leaderboard-link"
                  >
                    View on Uniswap →
                  </a>
                </div>
              ))}
            </div>

            {raceData.lastUpdated && (
              <div className="last-updated">
                Last updated: {new Date(raceData.lastUpdated).toLocaleTimeString()}
                {raceData.source === 'on-chain' && (
                  <span className="data-source"> • On-chain V4 data</span>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Prize Info */}
        <div className="race-prize-info">
          <h3>The Prize</h3>
          <p>
            The winning pool gets... <strong>absolutely nothing!</strong>
          </p>
          <p>
            But we <em>will</em> mint a commemorative NFT announcing the winner
            and tag all the ticker symbols. Fame and glory await!
          </p>
          <p className="race-sponsor">
            Brought to you by <a href="https://abc.epicdylan.com" target="_blank" rel="noopener noreferrer">ABC</a>
          </p>
        </div>

        {/* Rules */}
        <div className="race-rules">
          <h3>The Rules</h3>
          <ul>
            <li>Each pool started with $20 of liquidity</li>
            <li>24h trading volume is measured at midnight UTC on Saturday, February 1st, 2026</li>
            <li>Highest 24h volume wins</li>
            <li>No prizes, just bragging rights</li>
            <li>Have fun!</li>
          </ul>
        </div>
      </div>

      <Footer />

      <style jsx>{`
        .race-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .race-title {
          font-size: 2rem;
          font-weight: 800;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .race-emoji {
          font-size: 1.5rem;
        }

        .race-subtitle {
          color: var(--muted);
          margin-top: 0.5rem;
          font-size: 1rem;
        }

        .countdown-container {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1));
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 1rem;
          padding: 1.5rem;
          text-align: center;
          margin-bottom: 2rem;
        }

        .countdown-label {
          font-size: 0.875rem;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 0.5rem;
        }

        .countdown-timer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .countdown-unit {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .countdown-value {
          font-size: 2.5rem;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .countdown-label-small {
          font-size: 0.75rem;
          color: var(--muted);
          text-transform: uppercase;
        }

        .countdown-separator {
          font-size: 2rem;
          font-weight: 800;
          color: var(--muted);
          margin-bottom: 1rem;
        }

        .countdown-end-date {
          font-size: 0.75rem;
          color: var(--muted);
          margin-top: 1rem;
        }

        .race-ended {
          padding: 1rem;
        }

        .race-ended .trophy {
          font-size: 3rem;
          display: block;
          margin-bottom: 0.5rem;
        }

        .race-ended h2 {
          margin: 0 0 0.5rem 0;
          color: #ffd700;
        }

        .winner-announcement {
          font-size: 1.125rem;
          margin: 0;
        }

        .race-leaderboard {
          margin-bottom: 2rem;
        }

        .leaderboard-title {
          font-size: 1.25rem;
          margin: 0 0 1rem 0;
        }

        .leaderboard-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .leaderboard-row {
          display: grid;
          grid-template-columns: 3rem 1fr auto auto;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 0.75rem;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .leaderboard-row:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .leaderboard-row.top-1 {
          border-color: #ffd700;
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), transparent);
        }

        .leaderboard-row.top-2 {
          border-color: #c0c0c0;
          background: linear-gradient(135deg, rgba(192, 192, 192, 0.1), transparent);
        }

        .leaderboard-row.top-3 {
          border-color: #cd7f32;
          background: linear-gradient(135deg, rgba(205, 127, 50, 0.1), transparent);
        }

        .leaderboard-rank {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .rank-badge {
          font-size: 1.5rem;
          font-weight: 700;
        }

        .rank-badge.medal {
          font-size: 1.75rem;
        }

        .leaderboard-pool {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .pool-pair {
          font-weight: 600;
          font-size: 1rem;
        }

        .pool-fee {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .leaderboard-stats {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .leaderboard-volume {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.125rem;
        }

        .volume-value {
          font-weight: 700;
          font-size: 1.125rem;
          color: var(--positive);
        }

        .volume-label {
          font-size: 0.625rem;
          color: var(--muted);
          text-transform: uppercase;
        }

        .leaderboard-swaps {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.125rem;
          padding: 0.25rem 0.5rem;
          background: rgba(99, 102, 241, 0.1);
          border-radius: 0.5rem;
        }

        .swaps-value {
          font-weight: 700;
          font-size: 1rem;
          color: var(--primary);
        }

        .swaps-label {
          font-size: 0.5rem;
          color: var(--muted);
          text-transform: uppercase;
        }

        .leaderboard-link {
          font-size: 0.75rem;
          color: var(--primary);
          text-decoration: none;
          white-space: nowrap;
        }

        .leaderboard-link:hover {
          text-decoration: underline;
        }

        .last-updated {
          font-size: 0.75rem;
          color: var(--muted);
          text-align: center;
          margin-top: 1rem;
        }

        .data-source {
          color: var(--positive);
          font-weight: 500;
        }

        .race-prize-info,
        .race-rules {
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin-bottom: 1rem;
        }

        .race-prize-info h3,
        .race-rules h3 {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
        }

        .race-prize-info p {
          margin: 0.5rem 0;
          color: var(--muted);
        }

        .race-sponsor {
          margin-top: 1rem !important;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border);
          font-size: 0.875rem;
        }

        .race-sponsor a {
          color: var(--accent);
          font-weight: 600;
          text-decoration: none;
        }

        .race-sponsor a:hover {
          text-decoration: underline;
        }

        .race-rules ul {
          margin: 0;
          padding-left: 1.5rem;
          color: var(--muted);
        }

        .race-rules li {
          margin-bottom: 0.5rem;
        }

        @media (max-width: 640px) {
          .race-title {
            font-size: 1.5rem;
            flex-wrap: wrap;
          }

          .countdown-value {
            font-size: 1.75rem;
          }

          .leaderboard-row {
            grid-template-columns: 2.5rem 1fr auto;
            gap: 0.5rem;
          }

          .leaderboard-link {
            display: none;
          }

          .leaderboard-row:active {
            transform: scale(0.98);
          }
        }
      `}</style>
    </div>
  )
}
