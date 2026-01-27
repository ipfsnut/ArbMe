'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet, useIsFarcaster } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { ROUTES } from '@/utils/constants'
import { buyRatchet } from '@/lib/actions'
// SDK imported dynamically to avoid module-level crashes on mobile
import { useSendTransaction } from 'wagmi'

const API_BASE = '/api'

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
  const num = Number(BigInt(value)) / Math.pow(10, decimals)
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

// Parse input to wei
function parseToWei(value: string, decimals: number = 18): string {
  const num = parseFloat(value)
  if (isNaN(num) || num <= 0) return '0'
  return BigInt(Math.floor(num * Math.pow(10, decimals))).toString()
}

export default function StakePage() {
  const wallet = useWallet()
  const isFarcaster = useIsFarcaster()
  const [data, setData] = useState<StakingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [stakeAmount, setStakeAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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

  // Calculate if approval is needed
  const needsApproval = data
    ? BigInt(data.allowance) < BigInt(parseToWei(stakeAmount || '0'))
    : false

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
    try {
      await executeStakingAction('/api/staking/approve')
      await fetchData()
    } catch (err: any) {
      console.error('[Stake] Approve error:', err)
      alert(err.message || 'Approval failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStake = async () => {
    if (!wallet || !stakeAmount) return
    const amount = parseToWei(stakeAmount)
    if (amount === '0') return

    setActionLoading('stake')
    try {
      await executeStakingAction('/api/staking/stake', { amount })
      setStakeAmount('')
      await fetchData()
    } catch (err: any) {
      console.error('[Stake] Stake error:', err)
      alert(err.message || 'Staking failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleWithdraw = async () => {
    if (!wallet || !withdrawAmount) return
    const amount = parseToWei(withdrawAmount)
    if (amount === '0') return

    setActionLoading('withdraw')
    try {
      await executeStakingAction('/api/staking/withdraw', { amount })
      setWithdrawAmount('')
      await fetchData()
    } catch (err: any) {
      console.error('[Stake] Withdraw error:', err)
      alert(err.message || 'Withdrawal failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleClaim = async () => {
    if (!wallet) return
    setActionLoading('claim')
    try {
      await executeStakingAction('/api/staking/claim')
      await fetchData()
    } catch (err: any) {
      console.error('[Stake] Claim error:', err)
      alert(err.message || 'Claim failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleExit = async () => {
    if (!wallet) return
    setActionLoading('exit')
    try {
      await executeStakingAction('/api/staking/exit')
      await fetchData()
    } catch (err: any) {
      console.error('[Stake] Exit error:', err)
      alert(err.message || 'Exit failed')
    } finally {
      setActionLoading(null)
    }
  }

  const setMaxStake = () => {
    if (data) {
      const balance = Number(BigInt(data.balance)) / 1e18
      setStakeAmount(balance.toString())
    }
  }

  const setMaxWithdraw = () => {
    if (data) {
      const staked = Number(BigInt(data.staked)) / 1e18
      setWithdrawAmount(staked.toString())
    }
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back to Home" />

        <div className="section-header">
          <h2>Stake $RATCHET</h2>
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
                <span className="stat-value">{formatNumber(data.totalStaked)} RATCHET</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">APR</span>
                <span className="stat-value text-positive">{data.apr.toFixed(1)}%</span>
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
                    placeholder="0.00"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    min="0"
                    step="any"
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
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    min="0"
                    step="any"
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
        }

        .stat-label {
          font-size: 0.625rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
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
          font-size: 0.875rem;
          font-weight: 600;
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
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--accent);
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
      `}</style>
    </div>
  )
}
