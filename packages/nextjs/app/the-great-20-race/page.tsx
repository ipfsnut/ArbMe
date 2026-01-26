'use client'

import { useState, useEffect } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { ROUTES } from '@/utils/constants'

const API_BASE = '/api'

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
    </div>
  )
}
