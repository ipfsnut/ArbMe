'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet, useIsFarcaster, useIsSafe } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { ROUTES } from '@/utils/constants'
import { buyRatchet } from '@/lib/actions'
// SDK imported dynamically to avoid module-level crashes on mobile
import { useSendTransaction } from 'wagmi'
import { formatUnits } from 'viem'

const API_BASE = '/api'
const RATCHET_TOKEN = '0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07'

interface StakingData {
  contractDeployed: boolean
  staked: string
  earned: string
  totalStaked: string
  rewardRate: string
  periodFinish: number
  apr: number
  allowance: string
  balance: string
}

// Format large numbers with commas
function formatNumber(value: string, decimals: number = 18): string {
  const num = parseFloat(formatUnits(BigInt(value), decimals))
  if (num === 0) return '0'
  if (num < 0.01) return '<0.01'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K'
  return num.toFixed(2)
}

// Format countdown
function formatCountdown(periodFinish: number): string {
  const now = Math.floor(Date.now() / 1000)
  const remaining = periodFinish - now

  if (remaining <= 0) return 'Ended'

  const days = Math.floor(remaining / 86400)
  const hours = Math.floor((remaining % 86400) / 3600)

  if (days > 0) return `${days}d ${hours}h`
  const minutes = Math.floor((remaining % 3600) / 60)
  return `${hours}h ${minutes}m`
}

// Format calculator amounts (from plain numbers, not wei)
function formatCalcAmount(num: number): string {
  if (num === 0) return '0'
  if (num < 0.01) return '<0.01'
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K'
  return num.toFixed(2)
}

// Parse whole number input to wei (no decimals — avoids floating-point precision bugs)
function parseToWei(value: string, decimals: number = 18): string {
  const whole = parseInt(value, 10)
  if (isNaN(whole) || whole <= 0) return '0'
  return (BigInt(whole) * 10n ** BigInt(decimals)).toString()
}

export default function StakePage() {
  const wallet = useWallet()
  const isFarcaster = useIsFarcaster()
  const isSafe = useIsSafe()
  const [data, setData] = useState<StakingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [stakeAmount, setStakeAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Reward calculator state
  const [calcAmount, setCalcAmount] = useState('')
  const [ratchetPrice, setRatchetPrice] = useState<number>(0)

  // Wagmi hook for browser transactions
  const { sendTransactionAsync } = useSendTransaction()

  // Helper to send transaction (works in both modes)
  const sendTx = async (tx: { to: string; data: string; value: string }): Promise<string> => {
    if (isFarcaster) {
      // Use Farcaster SDK for miniapp
      const farcasterSdk = (await import('@farcaster/miniapp-sdk')).default
      const provider = await farcasterSdk.wallet.getEthereumProvider()
      if (!provider) throw new Error('No wallet provider')

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet as `0x${string}`,
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: tx.value !== '0' ? `0x${BigInt(tx.value).toString(16)}` as `0x${string}` : '0x0',
        }],
      })

      return txHash as string
    } else {
      // Use wagmi for browser wallet
      const txHash = await sendTransactionAsync({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value !== '0' ? BigInt(tx.value) : 0n,
      })

      return txHash
    }
  }

  const fetchData = useCallback(async () => {
    if (!wallet) {
      setLoading(false)
      return
    }

    try {
      setError(null)
      const res = await fetch(`${API_BASE}/staking/info?wallet=${wallet}`)
      if (!res.ok) {
        throw new Error('Failed to fetch staking info')
      }
      const result = await res.json()
      setData(result)
    } catch (err: any) {
      console.error('[StakePage] Error:', err)
      setError(err.message || 'Failed to load staking info')
    } finally {
      setLoading(false)
    }
  }, [wallet])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Fetch RATCHET price for reward calculator
  useEffect(() => {
    fetch(`${API_BASE}/token-price?address=${RATCHET_TOKEN}`)
      .then(res => res.json())
      .then(data => { if (data.price) setRatchetPrice(data.price) })
      .catch(() => {})
  }, [])

  // Calculate if approval is needed
  const needsApproval = data
    ? BigInt(data.allowance) < BigInt(parseToWei(stakeAmount || '0'))
    : false

  // Wait for tx to be mined before refreshing data
  const waitAndRefresh = async () => {
    if (isSafe) {
      // Safe txs are proposals — refresh after a short delay to show current state
      await new Promise(r => setTimeout(r, 2000))
    } else {
      // Wait for the tx to likely be mined on Base (~2s blocks)
      await new Promise(r => setTimeout(r, 4000))
    }
    await fetchData()
  }

  // Helper to build and send a staking transaction
  const executeStakingAction = async (endpoint: string, body: object = {}): Promise<void> => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Failed to build transaction')
    }

    const { transaction } = await response.json()
    await sendTx(transaction)
  }

  // Action handlers
  const handleApprove = async () => {
    if (!wallet) return
    setActionLoading('approve')
    setActionError(null)
    try {
      await executeStakingAction('/api/staking/approve')
      await waitAndRefresh()
    } catch (err: any) {
      console.error('[Stake] Approve error:', err)
      setActionError(err.message || 'Approval failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStake = async () => {
    if (!wallet || !stakeAmount) return
    const amount = parseToWei(stakeAmount)
    if (amount === '0') return

    setActionLoading('stake')
    setActionError(null)
    try {
      await executeStakingAction('/api/staking/stake', { amount })
      setStakeAmount('')
      await waitAndRefresh()
    } catch (err: any) {
      console.error('[Stake] Stake error:', err)
      setActionError(err.message || 'Staking failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleWithdraw = async () => {
    if (!wallet || !withdrawAmount) return
    const amount = parseToWei(withdrawAmount)
    if (amount === '0') return

    setActionLoading('withdraw')
    setActionError(null)
    try {
      await executeStakingAction('/api/staking/withdraw', { amount })
      setWithdrawAmount('')
      await waitAndRefresh()
    } catch (err: any) {
      console.error('[Stake] Withdraw error:', err)
      setActionError(err.message || 'Withdrawal failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleClaim = async () => {
    if (!wallet) return
    setActionLoading('claim')
    setActionError(null)
    try {
      await executeStakingAction('/api/staking/claim')
      await waitAndRefresh()
    } catch (err: any) {
      console.error('[Stake] Claim error:', err)
      setActionError(err.message || 'Claim failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleExit = async () => {
    if (!wallet) return
    setActionLoading('exit')
    setActionError(null)
    try {
      await executeStakingAction('/api/staking/exit')
      await waitAndRefresh()
    } catch (err: any) {
      console.error('[Stake] Exit error:', err)
      setActionError(err.message || 'Exit failed')
    } finally {
      setActionLoading(null)
    }
  }

  const setMaxStake = () => {
    if (data) {
      const whole = (BigInt(data.balance) / 10n ** 18n).toString()
      setStakeAmount(whole)
    }
  }

  const setMaxWithdraw = () => {
    if (data) {
      const whole = (BigInt(data.staked) / 10n ** 18n).toString()
      setWithdrawAmount(whole)
    }
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back to Home" />

        <div className="section-header">
          <h2>The Ratchet</h2>
          <p className="section-subtitle">Ecosystem utility token — liquid, stakeable, deflationary</p>
        </div>

        {/* About RATCHET */}
        <div className="ratchet-info">
          <div className="info-card">
            <h3>How it works</h3>
            <p>$RATCHET is designed to be liquid. It trades against multiple tokens in the ecosystem — CHAOS, ARBME, MLTL, and more. When you stake RATCHET, you earn more RATCHET from protocol emissions while constricting the circulating supply.</p>
            <p>Trading fees from RATCHET pairs are used to buy $ARBME, tying the two tokens together. More RATCHET volume means more ARBME demand.</p>
          </div>

          <div className="info-card">
            <h3>Emission schedule</h3>
            <p className="emission-note">15% of total $RATCHET supply distributed to stakers over 5 years:</p>
            <div className="emission-table">
              <div className="emission-row"><span>Year 1</span><span className="emission-pct">5%</span></div>
              <div className="emission-row"><span>Year 2</span><span className="emission-pct">4%</span></div>
              <div className="emission-row"><span>Year 3</span><span className="emission-pct">3%</span></div>
              <div className="emission-row"><span>Year 4</span><span className="emission-pct">2%</span></div>
              <div className="emission-row"><span>Year 5</span><span className="emission-pct">1%</span></div>
            </div>
            <p className="emission-note">Emissions decrease each year. Early stakers earn the most.</p>
          </div>

          <div className="info-card">
            <h3>The flywheel</h3>
            <div className="flywheel">
              <span>Stake RATCHET</span>
              <span className="flywheel-arrow">→</span>
              <span>Supply tightens</span>
              <span className="flywheel-arrow">→</span>
              <span>Trading fees buy ARBME</span>
              <span className="flywheel-arrow">→</span>
              <span>Ecosystem grows</span>
            </div>
          </div>
        </div>

        {!wallet ? (
          <div className="empty-state">
            <p>Connect your wallet to stake</p>
            <p className="hint">Your wallet will connect automatically in Farcaster</p>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading staking info...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={() => { setLoading(true); fetchData(); }}>Retry</button>
          </div>
        ) : !data?.contractDeployed ? (
          <div className="empty-state">
            <p>Staking coming soon!</p>
            <p className="hint">The staking contract is being deployed</p>
          </div>
        ) : (
          <div className="staking-container">
            {/* Global Stats */}
            <div className="staking-stats">
              <div className="stat-card">
                <span className="stat-label">Total Staked</span>
                <span className="stat-value">{formatNumber(data.totalStaked)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">APR</span>
                <span className="stat-value text-positive">
                  {data.periodFinish > 0 && data.periodFinish < Math.floor(Date.now() / 1000) ? 'Ended' : `${data.apr.toFixed(1)}%`}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Time Remaining</span>
                <span className="stat-value">{formatCountdown(data.periodFinish)}</span>
              </div>
            </div>

            {/* User Info */}
            <div className="staking-user-info">
              <div className="user-stat">
                <span className="user-stat-label">Your Stake</span>
                <span className="user-stat-value">{formatNumber(data.staked)} RATCHET</span>
              </div>
              <div className="user-stat">
                <span className="user-stat-label">Your Rewards</span>
                <span className="user-stat-value text-positive">{formatNumber(data.earned)} RATCHET</span>
              </div>
              <div className="user-stat">
                <span className="user-stat-label">Wallet Balance</span>
                <span className="user-stat-value">{formatNumber(data.balance)} RATCHET</span>
              </div>
              <button className="btn btn-primary buy-ratchet-btn" onClick={buyRatchet}>
                Buy $RATCHET
              </button>
            </div>

            {/* Action Error */}
            {actionError && (
              <div className="action-error" onClick={() => setActionError(null)}>
                {actionError}
              </div>
            )}

            {/* Stake Section */}
            <div className="staking-section">
              <h3>Stake</h3>
              <div className="input-group">
                <div className="input-label">
                  <span>Amount</span>
                  <span className="input-balance" onClick={setMaxStake}>
                    Balance: {formatNumber(data.balance)}
                  </span>
                </div>
                <div className="input-wrapper">
                  <input
                    type="number"
                    className="amount-input"
                    placeholder="0"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value.replace(/\./g, ''))}
                    min="0"
                    step="1"
                  />
                  <div className="input-token">RATCHET</div>
                </div>
              </div>
              <div className="action-buttons">
                {needsApproval ? (
                  <button
                    className="btn btn-primary full-width"
                    onClick={handleApprove}
                    disabled={actionLoading === 'approve' || !stakeAmount}
                  >
                    {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary full-width"
                    onClick={handleStake}
                    disabled={actionLoading === 'stake' || !stakeAmount}
                  >
                    {actionLoading === 'stake' ? 'Staking...' : 'Stake'}
                  </button>
                )}
              </div>
            </div>

            {/* Withdraw Section */}
            <div className="staking-section">
              <h3>Withdraw</h3>
              <div className="input-group">
                <div className="input-label">
                  <span>Amount</span>
                  <span className="input-balance" onClick={setMaxWithdraw}>
                    Staked: {formatNumber(data.staked)}
                  </span>
                </div>
                <div className="input-wrapper">
                  <input
                    type="number"
                    className="amount-input"
                    placeholder="0"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value.replace(/\./g, ''))}
                    min="0"
                    step="1"
                  />
                  <div className="input-token">RATCHET</div>
                </div>
              </div>
              <div className="action-buttons">
                <button
                  className="btn btn-secondary full-width"
                  onClick={handleWithdraw}
                  disabled={actionLoading === 'withdraw' || !withdrawAmount || BigInt(data.staked) === 0n}
                >
                  {actionLoading === 'withdraw' ? 'Withdrawing...' : 'Withdraw'}
                </button>
              </div>
            </div>

            {/* Rewards Section */}
            <div className="staking-section">
              <h3>Rewards</h3>
              <div className="rewards-display">
                <span className="rewards-amount">{formatNumber(data.earned)}</span>
                <span className="rewards-token">RATCHET earned</span>
              </div>
              <div className="action-buttons rewards-buttons">
                <button
                  className="btn btn-primary"
                  onClick={handleClaim}
                  disabled={actionLoading === 'claim' || BigInt(data.earned) === 0n}
                >
                  {actionLoading === 'claim' ? 'Claiming...' : 'Claim Rewards'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleExit}
                  disabled={actionLoading === 'exit' || (BigInt(data.staked) === 0n && BigInt(data.earned) === 0n)}
                >
                  {actionLoading === 'exit' ? 'Exiting...' : 'Exit All'}
                </button>
              </div>
            </div>

            {/* Reward Calculator — only show while rewards are active */}
            {data.apr > 0 && data.periodFinish > Math.floor(Date.now() / 1000) && (
              <div className="staking-section">
                <h3>Reward Calculator</h3>
                <div className="input-group">
                  <div className="input-label">
                    <span>If you stake</span>
                    {ratchetPrice > 0 && calcAmount && (
                      <span className="input-balance">
                        ~${(parseFloat(calcAmount) * ratchetPrice).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="input-wrapper">
                    <input
                      type="number"
                      className="amount-input"
                      placeholder="0.00"
                      value={calcAmount}
                      onChange={(e) => setCalcAmount(e.target.value)}
                      min="0"
                      step="any"
                    />
                    <div className="input-token">RATCHET</div>
                  </div>
                </div>
                {calcAmount && parseFloat(calcAmount) > 0 && (
                  <div className="calc-results">
                    {[
                      { label: 'Daily', divisor: 365 },
                      { label: 'Weekly', divisor: 52 },
                      { label: 'Monthly', divisor: 12 },
                      { label: 'Yearly', divisor: 1 },
                    ].map(({ label, divisor }) => {
                      const yearly = parseFloat(calcAmount) * (data.apr / 100)
                      const amount = yearly / divisor
                      return (
                        <div className="calc-row" key={label}>
                          <span className="calc-label">{label}</span>
                          <div className="calc-values">
                            <span className="calc-ratchet">{formatCalcAmount(amount)} RATCHET</span>
                            {ratchetPrice > 0 && (
                              <span className="calc-usd">${(amount * ratchetPrice).toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <div className="calc-note">
                      Based on current {data.apr.toFixed(1)}% APR{ratchetPrice > 0 ? ` · $${ratchetPrice.toFixed(6)}/RATCHET` : ''}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Contract Transparency */}
            <div className="contract-info">
              <span className="contract-label">Staking Contract</span>
              <a
                href="https://basescan.org/address/0x9Bf5fc3C400c619B9c73CE4D4c847c4707baE5E7"
                target="_blank"
                rel="noopener noreferrer"
                className="contract-address"
              >
                0x9Bf5fc3C400c619B9c73CE4D4c847c4707baE5E7
              </a>
            </div>
          </div>
        )}
      </div>

      <Footer />

      <style jsx>{`
        .section-subtitle {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }

        .ratchet-info {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .info-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem;
        }

        .info-card h3 {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 0.5rem;
        }

        .info-card p {
          font-size: 0.8125rem;
          color: var(--text-primary);
          line-height: 1.5;
          margin-bottom: 0.5rem;
        }

        .info-card p:last-child {
          margin-bottom: 0;
        }

        .emission-table {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          margin: 0.5rem 0;
        }

        .emission-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.375rem 0.5rem;
          background: var(--bg-secondary);
          border-radius: 6px;
          font-size: 0.8125rem;
        }

        .emission-pct {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-weight: 600;
          color: var(--accent);
        }

        .emission-note {
          font-size: 0.75rem !important;
          color: var(--text-muted) !important;
        }

        .flywheel {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.8125rem;
          color: var(--text-primary);
        }

        .flywheel-arrow {
          color: var(--accent);
          font-weight: 600;
        }

        .staking-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .staking-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.5rem;
        }

        .stat-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.75rem 0.5rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 0;
          overflow: hidden;
        }

        .stat-label {
          font-size: 0.625rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .staking-user-info {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .user-stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .user-stat-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .user-stat-value {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.8125rem;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }

        .staking-section {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem;
        }

        .staking-section h3 {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: 0.75rem;
        }

        .action-buttons {
          margin-top: 0.75rem;
        }

        .rewards-display {
          text-align: center;
          padding: 1rem 0;
        }

        .rewards-amount {
          display: block;
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--accent);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rewards-token {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .rewards-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .full-width {
          width: 100%;
        }

        .text-positive {
          color: var(--positive);
        }

        .buy-ratchet-btn {
          width: 100%;
          margin-top: 0.75rem;
        }

        .calc-results {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border);
        }

        .calc-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .calc-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          flex-shrink: 0;
        }

        .calc-values {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          min-width: 0;
        }

        .calc-ratchet {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .calc-usd {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }

        .calc-note {
          font-size: 0.625rem;
          color: var(--text-muted);
          text-align: center;
          margin-top: 0.25rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .contract-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding: 1rem;
          border-top: 1px solid var(--border);
          margin-top: 0.5rem;
        }

        .contract-label {
          font-size: 0.625rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .contract-address {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.7rem;
          color: var(--text-secondary);
          text-decoration: none;
          word-break: break-all;
          text-align: center;
        }

        .contract-address:hover {
          color: var(--accent);
          text-decoration: underline;
        }

        .action-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          font-size: 0.8125rem;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
