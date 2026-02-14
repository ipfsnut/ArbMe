'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet, useIsFarcaster, useIsSafe } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { PositionCard } from '@/components/PositionCard'
import { ROUTES, CHAOS_FOUNDATION_MULTISIG, CHAOS_GAUGES, CHAOS_STAKING_ADDRESS, RATCHET_CAMPAIGN_ADDRESS } from '@/utils/constants'
import { useSendTransaction } from 'wagmi'
import { formatUnits } from 'viem'
import type { Position } from '@/utils/types'

const BASESCAN_SAFE_URL = `https://app.safe.global/home?safe=base:${CHAOS_FOUNDATION_MULTISIG}`
const MOLTLAUNCH_URL = 'https://moltlaunch.com/agent/0x3d9d'
const FLAUNCH_TRADE_URL = 'https://www.flaunch.gg/base/coin/0xFaB2ee8eB6B26208BfB5c41012661e62b4Dc9292'
const BASESCAN_TOKEN_URL = 'https://basescan.org/token/0xFaB2ee8eB6B26208BfB5c41012661e62b4Dc9292'
const ABC_ALPHA_URL = 'https://warpcast.com/abc-alpha'

const SERVICES = [
  {
    name: 'Pool Health Check',
    type: 'code',
    description: 'Scan your token\'s pools. Get a report on spreads, fee tiers, routing gaps, and specific issues to fix.',
    turnaround: '24h',
    price: '0.0050 ETH',
  },
  {
    name: 'New Token Volume Package',
    type: 'code',
    description: 'Full launch infrastructure: 3 pools (CHAOS/USDC/MLTL), preseeded liquidity, staking contract, Gnosis Safe.',
    turnaround: '72h',
    price: '0.2500 ETH',
  },
  {
    name: 'LP Strategy Consult',
    type: 'general',
    description: 'Deep strategic analysis for your token\'s liquidity architecture. Written strategy doc from 40+ pool deployments.',
    turnaround: '48h',
    price: '1.00 ETH',
  },
]

const ECOSYSTEM_TOKENS = [
  { symbol: 'CHAOS', role: 'Hub' },
  { symbol: 'ARBME', role: 'Infrastructure' },
  { symbol: 'USDC', role: 'Stablecoin' },
  { symbol: 'ALPHACLAW', role: 'Infrastructure' },
  { symbol: 'MLTL', role: 'Rail Token' },
  { symbol: 'OSO', role: 'Rail Token' },
  { symbol: 'Cnews', role: 'Rail Token' },
  { symbol: 'RATCHET', role: 'Infrastructure' },
]

// -- Helpers --

function formatNumber(value: string, decimals: number = 18): string {
  const num = parseFloat(formatUnits(BigInt(value || '0'), decimals))
  if (num === 0) return '0'
  if (num < 0.01) return '<0.01'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K'
  return num.toFixed(2)
}

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

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

function parseToWei(value: string, decimals: number = 18): string {
  const num = parseFloat(value)
  if (isNaN(num) || num <= 0) return '0'
  return BigInt(Math.floor(num * Math.pow(10, decimals))).toString()
}

interface GaugeData {
  symbol: string
  decimals: number
  pool: string
  week: number
  rewardRate: string
  periodFinish: number
  earned: string
  inAssetApr: number
  status: string
}

interface StakingInfo {
  contractDeployed: boolean
  totalStaked: string
  rewardRate: string
  periodFinish: number
  hubApr: number
  staked: string
  earned: string
  allowance: string
  balance: string
  gauges: GaugeData[]
}

interface AdminGaugeInfo {
  symbol: string
  pool: string
  decimals: number
  deployed: boolean
  walletBalance: string
  allowance: string
  rewardRate: string
  periodFinish: number
  rewardsDuration: number
}

interface CampaignInfo {
  active: boolean
  totalClaimed: number
  maxClaims: number
  userEligible: boolean
  userClaimed: boolean
  userExcluded: boolean
  userStaking: boolean
}

export default function ChaosTheoryPage() {
  const wallet = useWallet()
  const isFarcaster = useIsFarcaster()
  const isSafe = useIsSafe()
  const { sendTransactionAsync } = useSendTransaction()

  // Foundation positions state
  const [positions, setPositions] = useState<Position[]>([])
  const [posLoading, setPosLoading] = useState(true)
  const [posError, setPosError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Staking state
  const [stakingData, setStakingData] = useState<StakingInfo | null>(null)
  const [stakingLoading, setStakingLoading] = useState(true)
  const [stakeAmount, setStakeAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Admin state (multisig only)
  const [adminGauges, setAdminGauges] = useState<AdminGaugeInfo[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [rewardAmounts, setRewardAmounts] = useState<Record<number, string>>({})
  const [adminActionLoading, setAdminActionLoading] = useState<string | null>(null)
  const [adminError, setAdminError] = useState<string | null>(null)

  // Campaign state
  const [campaignData, setCampaignData] = useState<CampaignInfo | null>(null)
  const [campaignLoading, setCampaignLoading] = useState(false)

  // -- Data fetching --

  const fetchPositions = async () => {
    setPosLoading(true)
    setPosError(null)
    try {
      const res = await fetch(`/api/positions?wallet=${CHAOS_FOUNDATION_MULTISIG}`)
      if (!res.ok) throw new Error(`Failed to fetch positions (${res.status})`)
      const data = await res.json()
      setPositions(data.positions || [])
      setLastUpdated(new Date())
    } catch (err: any) {
      setPosError(err.message || 'Failed to fetch positions')
    } finally {
      setPosLoading(false)
    }
  }

  const fetchStakingData = useCallback(async () => {
    try {
      const url = wallet
        ? `/api/chaos-staking/info?wallet=${wallet}`
        : '/api/chaos-staking/info'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setStakingData(data)
      }
    } catch {
      // Silently handle — will show not-deployed state
    } finally {
      setStakingLoading(false)
    }
  }, [wallet])

  const isMultisig = wallet?.toLowerCase() === CHAOS_FOUNDATION_MULTISIG.toLowerCase()

  const fetchAdminInfo = useCallback(async () => {
    if (!isMultisig || !wallet) return
    setAdminLoading(true)
    try {
      const res = await fetch(`/api/chaos-staking/admin/info?wallet=${wallet}`)
      if (res.ok) {
        const data = await res.json()
        setAdminGauges(data.gauges || [])
      }
    } catch {
      // Silently handle
    } finally {
      setAdminLoading(false)
    }
  }, [isMultisig, wallet])

  const fetchCampaignData = useCallback(async () => {
    if (RATCHET_CAMPAIGN_ADDRESS === '0x0000000000000000000000000000000000000000') return
    setCampaignLoading(true)
    try {
      const url = wallet
        ? `/api/ratchet-campaign/info?wallet=${wallet}`
        : '/api/ratchet-campaign/info'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setCampaignData(data)
      }
    } catch {
      // Silently handle
    } finally {
      setCampaignLoading(false)
    }
  }, [wallet])

  useEffect(() => { fetchPositions() }, [])
  useEffect(() => { fetchStakingData() }, [fetchStakingData])
  useEffect(() => { fetchAdminInfo() }, [fetchAdminInfo])
  useEffect(() => { fetchCampaignData() }, [fetchCampaignData])

  // -- Transaction helpers --

  const sendTx = async (tx: { to: string; data: string; value: string }): Promise<string> => {
    if (isFarcaster) {
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
      return await sendTransactionAsync({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value !== '0' ? BigInt(tx.value) : 0n,
      })
    }
  }

  const waitAndRefresh = async () => {
    await new Promise(r => setTimeout(r, isSafe ? 2000 : 4000))
    await fetchStakingData()
  }

  const executeAction = async (endpoint: string, body: object = {}) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Transaction failed')
    }
    const { transaction } = await res.json()
    await sendTx(transaction)
  }

  const handleApprove = async () => {
    setActionLoading('approve'); setActionError(null)
    try { await executeAction('/api/chaos-staking/approve'); await waitAndRefresh() }
    catch (e: any) { setActionError(e.message) }
    finally { setActionLoading(null) }
  }
  const handleStake = async () => {
    const amount = parseToWei(stakeAmount); if (amount === '0') return
    setActionLoading('stake'); setActionError(null)
    try { await executeAction('/api/chaos-staking/stake', { amount }); setStakeAmount(''); await waitAndRefresh() }
    catch (e: any) { setActionError(e.message) }
    finally { setActionLoading(null) }
  }
  const handleWithdraw = async () => {
    const amount = parseToWei(withdrawAmount); if (amount === '0') return
    setActionLoading('withdraw'); setActionError(null)
    try { await executeAction('/api/chaos-staking/withdraw', { amount }); setWithdrawAmount(''); await waitAndRefresh() }
    catch (e: any) { setActionError(e.message) }
    finally { setActionLoading(null) }
  }
  const handleClaim = async () => {
    setActionLoading('claim'); setActionError(null)
    try { await executeAction('/api/chaos-staking/claim'); await waitAndRefresh() }
    catch (e: any) { setActionError(e.message) }
    finally { setActionLoading(null) }
  }
  const handleExit = async () => {
    setActionLoading('exit'); setActionError(null)
    try { await executeAction('/api/chaos-staking/exit'); await waitAndRefresh() }
    catch (e: any) { setActionError(e.message) }
    finally { setActionLoading(null) }
  }

  // Campaign claim
  const handleCampaignClaim = async () => {
    setCampaignLoading(true)
    try {
      await executeAction('/api/ratchet-campaign/claim')
      await new Promise(r => setTimeout(r, isSafe ? 2000 : 4000))
      await fetchCampaignData()
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setCampaignLoading(false)
    }
  }

  // Admin actions
  const handleAdminApprove = async (gaugeIndex: number) => {
    setAdminActionLoading(`approve-${gaugeIndex}`); setAdminError(null)
    try {
      const res = await fetch('/api/chaos-staking/admin/approve-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gaugeIndex }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to build approve tx')
      }
      const { transaction } = await res.json()
      await sendTx(transaction)
      await new Promise(r => setTimeout(r, isSafe ? 2000 : 4000))
      await fetchAdminInfo()
    } catch (e: any) { setAdminError(e.message) }
    finally { setAdminActionLoading(null) }
  }

  const handleNotifyReward = async (gaugeIndex: number) => {
    const gauge = adminGauges[gaugeIndex]
    if (!gauge) return
    const rawAmount = rewardAmounts[gaugeIndex]
    const amount = parseToWei(rawAmount || '0', gauge.decimals)
    if (amount === '0') return
    setAdminActionLoading(`notify-${gaugeIndex}`); setAdminError(null)
    try {
      const res = await fetch('/api/chaos-staking/admin/notify-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gaugeIndex, amount }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to build notify tx')
      }
      const { transaction } = await res.json()
      await sendTx(transaction)
      setRewardAmounts(prev => ({ ...prev, [gaugeIndex]: '' }))
      await new Promise(r => setTimeout(r, isSafe ? 2000 : 4000))
      await fetchAdminInfo()
    } catch (e: any) { setAdminError(e.message) }
    finally { setAdminActionLoading(null) }
  }

  // Derived
  const needsApproval = stakingData?.contractDeployed
    ? BigInt(stakingData.allowance) < BigInt(parseToWei(stakeAmount || '0'))
    : false
  const totalTvl = positions.reduce((sum, p) => sum + (p.liquidityUsd || 0), 0)
  const isDeployed = stakingData?.contractDeployed ?? false
  const gauges = stakingData?.gauges || CHAOS_GAUGES.map(g => ({
    ...g, rewardRate: '0', periodFinish: 0, earned: '0', inAssetApr: 0, status: 'pending',
  }))

  const setMaxStake = () => {
    if (stakingData) setStakeAmount(formatUnits(BigInt(stakingData.balance), 18))
  }
  const setMaxWithdraw = () => {
    if (stakingData) setWithdrawAmount(formatUnits(BigInt(stakingData.staked), 18))
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back to Home" />

        {/* Hero */}
        <div className="section-header">
          <h2>ChaosTheory</h2>
        </div>

        {/* About */}
        <div className="ct-about">
          <p className="ct-about-text">
            Stake $CHAOS once. Earn 7 tokens. 180-day rolling streams from LP fees
            across 7 CHAOS pairs managed by the ChaosTheory Foundation.
          </p>
          <div className="ct-about-links">
            <a href={FLAUNCH_TRADE_URL} target="_blank" rel="noopener noreferrer" className="ct-link-pill">
              Trade $CHAOS
            </a>
            <a href={MOLTLAUNCH_URL} target="_blank" rel="noopener noreferrer" className="ct-link-pill">
              MoltLaunch Agent
            </a>
            <a href={ABC_ALPHA_URL} target="_blank" rel="noopener noreferrer" className="ct-link-pill">
              @abc_alpha
            </a>
            <a href={BASESCAN_TOKEN_URL} target="_blank" rel="noopener noreferrer" className="ct-link-pill">
              Basescan
            </a>
          </div>
        </div>

        {/* Stats Row — matches stake page pattern exactly */}
        <div className="staking-stats">
          <div className="stat-card">
            <span className="stat-label">Total Staked</span>
            <span className="stat-value">
              {isDeployed ? formatNumber(stakingData!.totalStaked) : '--'}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Positions</span>
            <span className="stat-value">{posLoading ? '...' : positions.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Foundation TVL</span>
            <span className="stat-value">{posLoading ? '...' : formatUsd(totalTvl)}</span>
          </div>
        </div>

        {/* ═══════ RATCHET CAMPAIGN BANNER ═══════ */}
        {campaignData && campaignData.active && wallet && !campaignData.userExcluded && (
          <div className={`rc-banner ${campaignData.userClaimed ? 'rc-claimed' : campaignData.userEligible ? 'rc-eligible' : ''}`}>
            <div className="rc-banner-top">
              <span className="rc-banner-title">RATCHET First-Staker Campaign</span>
              <span className="rc-banner-progress">{campaignData.totalClaimed} / {campaignData.maxClaims} claimed</span>
            </div>
            <div className="rc-progress-bar">
              <div className="rc-progress-fill" style={{ width: `${(campaignData.totalClaimed / campaignData.maxClaims) * 100}%` }} />
            </div>
            {campaignData.userClaimed ? (
              <div className="rc-banner-msg">You claimed 1M RATCHET!</div>
            ) : campaignData.userEligible ? (
              <div className="rc-banner-row">
                <span className="rc-banner-msg">You&apos;re eligible for 1M RATCHET!</span>
                <button className="btn btn-primary btn-sm" onClick={handleCampaignClaim} disabled={campaignLoading}>
                  {campaignLoading ? 'Claiming...' : 'Claim'}
                </button>
              </div>
            ) : !campaignData.userStaking ? (
              <div className="rc-banner-msg rc-banner-hint">Stake CHAOS above to become eligible</div>
            ) : null}
          </div>
        )}

        {/* ═══════ CHAOS STAKING HUB ═══════ */}
        {!isDeployed ? (
          <div className="empty-state">
            <p>Deployment in progress</p>
            <p className="hint">Hub + 7 reward gauge contracts deploying to Base. Staking will go live once the multisig confirms.</p>
          </div>
        ) : !wallet ? (
          <div className="empty-state">
            <p>Connect wallet to stake</p>
            <p className="hint">Your wallet connects automatically in Farcaster</p>
          </div>
        ) : (
          <div className="staking-container">
            {/* User Info — matches stake page */}
            <div className="staking-user-info">
              <div className="user-stat">
                <span className="user-stat-label">Your Stake</span>
                <span className="user-stat-value">{formatNumber(stakingData!.staked)} CHAOS</span>
              </div>
              {BigInt(stakingData!.earned) > 0n && (
                <div className="user-stat">
                  <span className="user-stat-label">CHAOS Earned</span>
                  <span className="user-stat-value text-positive">{formatNumber(stakingData!.earned)} CHAOS</span>
                </div>
              )}
              {gauges.filter(g => g.status === 'live' && BigInt(g.earned) > 0n).map(g => (
                <div className="user-stat" key={g.symbol}>
                  <span className="user-stat-label">{g.symbol} Earned</span>
                  <span className="user-stat-value text-positive">{formatNumber(g.earned, g.decimals)} {g.symbol}</span>
                </div>
              ))}
              <div className="user-stat">
                <span className="user-stat-label">Wallet Balance</span>
                <span className="user-stat-value">{formatNumber(stakingData!.balance)} CHAOS</span>
              </div>
            </div>

            {actionError && (
              <div className="action-error" onClick={() => setActionError(null)}>{actionError}</div>
            )}

            {/* Stake Section — matches stake page */}
            <div className="staking-section">
              <h3>Stake</h3>
              <div className="input-group">
                <div className="input-label">
                  <span>Amount</span>
                  <span className="input-balance" onClick={setMaxStake}>
                    Balance: {formatNumber(stakingData!.balance)}
                  </span>
                </div>
                <div className="input-wrapper">
                  <input
                    type="number" className="amount-input" placeholder="0.00"
                    value={stakeAmount} onChange={e => setStakeAmount(e.target.value)}
                    min="0" step="any"
                  />
                  <div className="input-token">CHAOS</div>
                </div>
              </div>
              <div className="action-buttons">
                {needsApproval ? (
                  <button className="btn btn-primary full-width" onClick={handleApprove}
                    disabled={actionLoading === 'approve' || !stakeAmount}>
                    {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
                  </button>
                ) : (
                  <button className="btn btn-primary full-width" onClick={handleStake}
                    disabled={actionLoading === 'stake' || !stakeAmount}>
                    {actionLoading === 'stake' ? 'Staking...' : 'Stake'}
                  </button>
                )}
              </div>
            </div>

            {/* Withdraw Section — matches stake page */}
            <div className="staking-section">
              <h3>Withdraw</h3>
              <div className="input-group">
                <div className="input-label">
                  <span>Amount</span>
                  <span className="input-balance" onClick={setMaxWithdraw}>
                    Staked: {formatNumber(stakingData!.staked)}
                  </span>
                </div>
                <div className="input-wrapper">
                  <input
                    type="number" className="amount-input" placeholder="0.00"
                    value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
                    min="0" step="any"
                  />
                  <div className="input-token">CHAOS</div>
                </div>
              </div>
              <div className="action-buttons">
                <button className="btn btn-secondary full-width" onClick={handleWithdraw}
                  disabled={actionLoading === 'withdraw' || !withdrawAmount || BigInt(stakingData!.staked) === 0n}>
                  {actionLoading === 'withdraw' ? 'Withdrawing...' : 'Withdraw'}
                </button>
              </div>
            </div>

            {/* Rewards */}
            <div className="staking-section">
              <h3>Rewards</h3>
              <div className="rewards-list">
                {gauges.filter(g => g.status === 'live').map(g => (
                  <div className="rewards-row" key={g.symbol}>
                    <span className="rewards-amount">{formatNumber(g.earned, g.decimals)}</span>
                    <span className="rewards-token">{g.symbol}</span>
                  </div>
                ))}
                {BigInt(stakingData!.earned) > 0n && (
                  <div className="rewards-row">
                    <span className="rewards-amount">{formatNumber(stakingData!.earned)}</span>
                    <span className="rewards-token">CHAOS (hub)</span>
                  </div>
                )}
                {gauges.filter(g => g.status === 'live').length === 0 && BigInt(stakingData!.earned) === 0n && (
                  <div className="rewards-row">
                    <span className="rewards-token">No active rewards yet</span>
                  </div>
                )}
              </div>
              <div className="action-buttons rewards-buttons">
                <button className="btn btn-primary" onClick={handleClaim}
                  disabled={actionLoading === 'claim'}>
                  {actionLoading === 'claim' ? 'Claiming...' : 'Claim All Rewards'}
                </button>
                <button className="btn btn-secondary" onClick={handleExit}
                  disabled={actionLoading === 'exit' || (BigInt(stakingData!.staked) === 0n && BigInt(stakingData!.earned) === 0n)}>
                  {actionLoading === 'exit' ? 'Exiting...' : 'Exit All'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ ADMIN PANEL (Multisig Only) ═══════ */}
        {isMultisig && (
          <div className="ct-section">
            <div className="section-header">
              <h2>Foundation Admin</h2>
            </div>
            <p className="ct-section-desc">
              Manage reward distribution. Approve reward tokens to gauge contracts, then call
              notifyRewardAmount to start 180-day streams. Balance rewarding stakers vs growing
              the community bag.
            </p>

            {adminError && (
              <div className="action-error" onClick={() => setAdminError(null)} style={{ marginBottom: '0.75rem' }}>
                {adminError}
              </div>
            )}

            {adminLoading ? (
              <div className="loading-state"><div className="loading-spinner" /><p>Loading admin data...</p></div>
            ) : (
              <div className="admin-gauges">
                {adminGauges.map((ag, idx) => {
                  const hasAllowance = BigInt(ag.allowance) > 0n
                  const isStreaming = ag.periodFinish > Math.floor(Date.now() / 1000)
                  return (
                    <div key={ag.symbol} className="admin-gauge-card">
                      <div className="admin-gauge-header">
                        <span className="admin-gauge-symbol">{ag.symbol}</span>
                        <span className={`rg-badge ${ag.deployed ? 'rg-badge-live' : 'rg-badge-pending'}`}>
                          {ag.deployed ? 'Deployed' : 'Not Deployed'}
                        </span>
                      </div>
                      <div className="admin-gauge-pool">{ag.pool}</div>

                      <div className="admin-gauge-stats">
                        <div className="admin-stat">
                          <span className="admin-stat-label">Multisig Balance</span>
                          <span className="admin-stat-value">
                            {formatNumber(ag.walletBalance, ag.decimals)} {ag.symbol}
                          </span>
                        </div>
                        {ag.deployed && (
                          <>
                            <div className="admin-stat">
                              <span className="admin-stat-label">Allowance</span>
                              <span className="admin-stat-value">
                                {BigInt(ag.allowance) > BigInt('1' + '0'.repeat(30))
                                  ? 'Unlimited'
                                  : formatNumber(ag.allowance, ag.decimals)}
                              </span>
                            </div>
                            <div className="admin-stat">
                              <span className="admin-stat-label">Stream Status</span>
                              <span className={`admin-stat-value ${isStreaming ? 'text-positive' : ''}`}>
                                {isStreaming ? formatCountdown(ag.periodFinish) + ' left' : 'Inactive'}
                              </span>
                            </div>
                            {isStreaming && (
                              <div className="admin-stat">
                                <span className="admin-stat-label">Reward Rate</span>
                                <span className="admin-stat-value">
                                  {formatNumber(
                                    (BigInt(ag.rewardRate) * 86400n).toString(),
                                    ag.decimals
                                  )} {ag.symbol}/day
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {ag.deployed && (
                        <div className="admin-gauge-actions">
                          {!hasAllowance && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleAdminApprove(idx)}
                              disabled={adminActionLoading === `approve-${idx}`}
                            >
                              {adminActionLoading === `approve-${idx}` ? 'Approving...' : `Approve ${ag.symbol}`}
                            </button>
                          )}
                          {hasAllowance && (
                            <div className="admin-notify-row">
                              <div className="input-wrapper">
                                <input
                                  type="number"
                                  className="amount-input"
                                  placeholder="0.00"
                                  value={rewardAmounts[idx] || ''}
                                  onChange={e => setRewardAmounts(prev => ({ ...prev, [idx]: e.target.value }))}
                                  min="0"
                                  step="any"
                                />
                                <div className="input-token">{ag.symbol}</div>
                              </div>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleNotifyReward(idx)}
                                disabled={adminActionLoading === `notify-${idx}` || !rewardAmounts[idx]}
                              >
                                {adminActionLoading === `notify-${idx}` ? 'Sending...' : 'Notify'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════ REWARD GAUGES ═══════ */}
        <div className="ct-section">
          <div className="section-header">
            <h2>Reward Gauges</h2>
          </div>
          <p className="ct-section-desc">
            Each gauge streams a different pair asset to $CHAOS stakers over 180 days.
            LP fees from 7 CHAOS pairs fund the gauges on a weekly rotation.
          </p>
          <div className="rg-grid">
            {gauges.map((g) => (
              <div key={g.symbol} className={`rg-card ${g.status === 'live' ? 'rg-live' : ''}`}>
                <div className="rg-header">
                  <span className="rg-symbol">{g.symbol}</span>
                  <span className={`rg-badge rg-badge-${g.status}`}>
                    {g.status === 'live' ? 'Streaming' : g.status === 'ended' ? 'Ended' : 'Pending'}
                  </span>
                </div>
                <div className="rg-pool">{g.pool}</div>
                <div className="rg-stats-row">
                  <div className="rg-stat">
                    <span className="rg-stat-label">In-Asset APR</span>
                    <span className="rg-stat-value">
                      {g.status === 'live' && g.inAssetApr > 0
                        ? `${g.inAssetApr.toFixed(2)} ${g.symbol}/yr`
                        : '--'}
                    </span>
                  </div>
                  <div className="rg-stat">
                    <span className="rg-stat-label">Earned</span>
                    <span className="rg-stat-value text-positive">
                      {isDeployed && wallet && BigInt(g.earned) > 0n
                        ? `${formatNumber(g.earned, g.decimals)} ${g.symbol}`
                        : '--'}
                    </span>
                  </div>
                </div>
                {g.status === 'live' && g.periodFinish > 0 && (
                  <div className="rg-remaining">
                    {formatCountdown(g.periodFinish)} remaining
                  </div>
                )}
                <div className="rg-week">Week {g.week} of rotation</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════ ROTATION SCHEDULE ═══════ */}
        <div className="ct-section">
          <div className="section-header">
            <h2>7-Week Rotation</h2>
          </div>
          <p className="ct-section-desc">
            LP fees are collected from one pair each week. The collected tokens
            fund a 180-day reward stream via <code className="ct-code">notifyRewardAmount</code>.
            CHAOS from LP fees is reinvested, not distributed.
          </p>
          <div className="rs-timeline">
            {gauges.map((g, i) => (
              <div key={g.symbol} className={`rs-row ${g.status === 'live' ? 'rs-active' : ''}`}>
                <div className="rs-track">
                  <div className={`rs-dot ${g.status === 'live' ? 'rs-dot-active' : ''}`} />
                  {i < gauges.length - 1 && <div className="rs-line" />}
                </div>
                <div className={`rs-card ${g.status === 'live' ? 'rs-card-active' : ''}`}>
                  <div className="rs-card-top">
                    <span className="rs-week-label">Week {g.week}</span>
                    <span className={`rg-badge rg-badge-${g.status}`}>
                      {g.status === 'live' ? 'Live' : g.status === 'ended' ? 'Ended' : 'Pending'}
                    </span>
                  </div>
                  <div className="rs-card-main">
                    <span className="rs-token">{g.symbol}</span>
                    <span className="rs-pool">{g.pool}</span>
                  </div>
                  <div className="rs-stream">180-day stream</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Multisig */}
        <div className="ct-address-card">
          <div className="ct-label">Foundation Multisig (Gnosis Safe)</div>
          <a href={BASESCAN_SAFE_URL} target="_blank" rel="noopener noreferrer" className="ct-address">
            {CHAOS_FOUNDATION_MULTISIG}
          </a>
        </div>

        {/* Services */}
        <div className="ct-section">
          <div className="section-header">
            <h2>Services</h2>
          </div>
          <div className="ct-services-list">
            {SERVICES.map((svc) => (
              <div key={svc.name} className="ct-service-card">
                <div className="ct-service-top">
                  <span className="ct-service-name">{svc.name}</span>
                  <span className="ct-service-type">{svc.type}</span>
                </div>
                <p className="ct-service-desc">{svc.description}</p>
                <div className="ct-service-meta">
                  <span>{svc.turnaround}</span>
                  <span className="ct-service-price">{svc.price}</span>
                </div>
              </div>
            ))}
          </div>
          <a href={MOLTLAUNCH_URL} target="_blank" rel="noopener noreferrer" className="ct-hire-btn">
            Hire ChaosTheory on MoltLaunch
          </a>
        </div>

        {/* Foundation Positions */}
        <div className="ct-section">
          <div className="section-header">
            <h2>Foundation Positions</h2>
            <button className="btn btn-sm btn-secondary" onClick={fetchPositions} disabled={posLoading}
              style={{ minWidth: 'auto', padding: '0.25rem 0.5rem', flex: 'none' }}>
              {posLoading ? '...' : '\u21BB'}
            </button>
          </div>

          {posLoading ? (
            <div className="loading-state"><div className="loading-spinner" /><p>Loading positions...</p></div>
          ) : posError ? (
            <div className="error-state"><p>{posError}</p><button className="btn btn-secondary" onClick={fetchPositions}>Retry</button></div>
          ) : positions.length === 0 ? (
            <div className="empty-state"><p>No positions found</p></div>
          ) : (
            <div className="positions-grid">
              {positions.map((position) => (
                <PositionCard key={position.id} position={position} />
              ))}
            </div>
          )}

          {lastUpdated && (
            <div className="ct-updated">Last updated: {lastUpdated.toLocaleTimeString()}</div>
          )}
        </div>

        {/* Ecosystem Tokens */}
        <div className="ct-section">
          <div className="section-header">
            <h2>Ecosystem Tokens</h2>
          </div>
          <div className="ct-tokens-list">
            {ECOSYSTEM_TOKENS.map((token) => (
              <div key={token.symbol} className="ct-token-row">
                <span className="ct-token-symbol">{token.symbol}</span>
                <span className="ct-token-role">{token.role}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contract footer */}
        <div className="contract-info">
          <span className="contract-label">CHAOS Staking Hub</span>
          {CHAOS_STAKING_ADDRESS !== '0x0000000000000000000000000000000000000000' ? (
            <a href={`https://basescan.org/address/${CHAOS_STAKING_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="contract-address">
              {CHAOS_STAKING_ADDRESS}
            </a>
          ) : (
            <span className="contract-label" style={{ fontStyle: 'italic' }}>Pending deployment</span>
          )}
        </div>
      </div>

      <Footer />

      <style jsx>{`
        /* ── About card ── */
        .ct-about {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .ct-about-text {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin: 0 0 0.75rem;
        }
        .ct-about-links {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
        }
        .ct-link-pill {
          font-size: 0.625rem;
          font-weight: 600;
          color: var(--text-secondary);
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 0.25rem 0.625rem;
          text-decoration: none;
          white-space: nowrap;
          transition: all 0.2s;
        }
        .ct-link-pill:hover {
          color: var(--accent);
          border-color: var(--accent);
        }

        /* ── Staking (reuses global .staking-*, .input-*, .btn) ── */
        .staking-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .staking-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.5rem;
          margin-bottom: 1rem;
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

        .rewards-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.5rem 0;
        }

        .rewards-row {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }

        .rewards-amount {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--accent);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rewards-token {
          font-size: 0.75rem;
          color: var(--text-muted);
          white-space: nowrap;
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

        .action-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          font-size: 0.8125rem;
          cursor: pointer;
        }

        /* ── Sections ── */
        .ct-section {
          margin-bottom: 1.5rem;
        }

        .ct-section-desc {
          font-size: 0.75rem;
          color: var(--text-muted);
          line-height: 1.5;
          margin: -0.5rem 0 0.75rem;
        }

        .ct-code {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.6875rem;
          background: var(--bg-secondary);
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
        }

        /* ── Multisig card ── */
        .ct-address-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.75rem 1rem;
          text-align: center;
          margin-bottom: 1rem;
        }
        .ct-label {
          font-size: 0.625rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 0.25rem;
        }
        .ct-address {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.7rem;
          color: var(--text-secondary);
          text-decoration: none;
          word-break: break-all;
        }
        .ct-address:hover {
          color: var(--accent);
          text-decoration: underline;
        }

        /* ── Services ── */
        .ct-services-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .ct-service-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.75rem;
        }
        .ct-service-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.375rem;
        }
        .ct-service-name {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .ct-service-type {
          font-size: 0.5625rem;
          color: var(--text-muted);
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 0.1rem 0.375rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .ct-service-desc {
          font-size: 0.6875rem;
          color: var(--text-secondary);
          line-height: 1.4;
          margin: 0 0 0.5rem;
        }
        .ct-service-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.625rem;
          color: var(--text-muted);
        }
        .ct-service-price {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-weight: 600;
          color: var(--text-primary);
        }
        .ct-hire-btn {
          display: block;
          text-align: center;
          margin-top: 0.75rem;
          padding: 0.625rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent);
          background: var(--accent-glow);
          border: 1px solid var(--accent);
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.2s;
        }
        .ct-hire-btn:hover {
          background: var(--accent);
          color: var(--bg-primary);
        }

        /* ── Tokens list ── */
        .ct-tokens-list {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .ct-token-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.625rem 1rem;
          border-bottom: 1px solid var(--border);
        }
        .ct-token-row:last-child {
          border-bottom: none;
        }
        .ct-token-symbol {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .ct-token-role {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }

        .ct-updated {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-align: center;
          margin-top: 0.5rem;
        }

        /* ── Contract footer — matches stake page ── */
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

        /* ── Reward Gauges ── */
        .rg-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.5rem;
        }
        @media (max-width: 400px) {
          .rg-grid {
            grid-template-columns: 1fr;
          }
        }
        .rg-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .rg-live {
          border-color: var(--accent);
        }
        .rg-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .rg-symbol {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .rg-badge {
          font-size: 0.5rem;
          font-weight: 600;
          border-radius: 4px;
          padding: 0.125rem 0.375rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          white-space: nowrap;
        }
        .rg-badge-pending {
          color: var(--text-muted);
          background: var(--bg-secondary);
          border: 1px solid var(--border);
        }
        .rg-badge-live {
          color: var(--accent);
          background: var(--accent-glow);
          border: 1px solid var(--accent);
        }
        .rg-badge-ended {
          color: var(--warning);
          background: rgba(255, 208, 87, 0.1);
          border: 1px solid rgba(255, 208, 87, 0.3);
        }
        .rg-pool {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .rg-stats-row {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .rg-stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .rg-stat-label {
          font-size: 0.5625rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .rg-stat-value {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--text-primary);
          text-align: right;
        }
        .rg-remaining {
          font-size: 0.625rem;
          color: var(--accent);
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
        }
        .rg-week {
          font-size: 0.5625rem;
          color: var(--text-muted);
          border-top: 1px solid var(--border);
          padding-top: 0.375rem;
        }

        /* ── Rotation Timeline ── */
        .rs-timeline {
          display: flex;
          flex-direction: column;
        }
        .rs-row {
          display: flex;
          gap: 0.75rem;
          min-height: 3.5rem;
        }
        .rs-track {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 1.25rem;
          flex-shrink: 0;
          padding-top: 0.75rem;
        }
        .rs-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-muted);
          flex-shrink: 0;
        }
        .rs-dot-active {
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
        }
        .rs-line {
          flex: 1;
          width: 1px;
          background: var(--border);
          margin-top: 0.25rem;
        }
        .rs-card {
          flex: 1;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.625rem 0.75rem;
          margin-bottom: 0.375rem;
        }
        .rs-card-active {
          border-color: var(--accent);
        }
        .rs-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.25rem;
        }
        .rs-week-label {
          font-size: 0.625rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .rs-card-main {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .rs-token {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .rs-pool {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .rs-stream {
          font-size: 0.5625rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
        }

        /* ── Admin Panel ── */
        .admin-gauges {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .admin-gauge-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.875rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .admin-gauge-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .admin-gauge-symbol {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .admin-gauge-pool {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .admin-gauge-stats {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
          padding: 0.5rem 0;
          border-top: 1px solid var(--border);
        }
        .admin-stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .admin-stat-label {
          font-size: 0.625rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .admin-stat-value {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .admin-gauge-actions {
          border-top: 1px solid var(--border);
          padding-top: 0.5rem;
        }
        .admin-notify-row {
          display: flex;
          gap: 0.5rem;
          align-items: stretch;
        }
        .admin-notify-row .input-wrapper {
          flex: 1;
        }
        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.6875rem;
          min-width: auto;
          white-space: nowrap;
        }

        /* ── RATCHET Campaign Banner ── */
        .rc-banner {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.875rem 1rem;
          margin-bottom: 1rem;
        }
        .rc-eligible {
          border-color: #22c55e;
          background: rgba(34, 197, 94, 0.05);
        }
        .rc-claimed {
          border-color: var(--text-muted);
          opacity: 0.8;
        }
        .rc-banner-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        .rc-banner-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .rc-banner-progress {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.625rem;
          color: var(--text-muted);
        }
        .rc-progress-bar {
          height: 4px;
          background: var(--bg-secondary);
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: 0.625rem;
        }
        .rc-progress-fill {
          height: 100%;
          background: #22c55e;
          border-radius: 2px;
          transition: width 0.3s;
        }
        .rc-banner-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
        }
        .rc-banner-msg {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .rc-claimed .rc-banner-msg {
          color: var(--text-muted);
        }
        .rc-banner-hint {
          font-weight: 400;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  )
}
