'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useWallet, useIsFarcaster } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { TokenInput } from '@/components/TokenInput'
import { FeeTierSelector } from '@/components/FeeTierSelector'
import { StepIndicator } from '@/components/StepIndicator'
import { ROUTES, ARBME_ADDRESS, WETH_ADDRESS, V2_ROUTER, V3_POSITION_MANAGER, V4_POSITION_MANAGER, V3_FEE_TIERS, V4_FEE_TIERS } from '@/utils/constants'
import sdk from '@farcaster/miniapp-sdk'
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'

const API_BASE = '/app/api'

// Format a number without scientific notation
function formatDecimal(num: number): string {
  if (num === 0) return '0'
  if (num >= 1) return num.toFixed(6)
  // For small numbers, find how many decimal places we need
  const str = num.toFixed(20)
  // Remove trailing zeros but keep at least 4 significant digits
  const match = str.match(/^0\.(0*)([1-9]\d{0,9})/)
  if (match) {
    const zeros = match[1].length
    const significant = match[2]
    // Show at least 4 significant digits
    const digitsToShow = Math.max(4, Math.min(significant.length, 8))
    return num.toFixed(zeros + digitsToShow)
  }
  return num.toFixed(10)
}

type Step = 1 | 2 | 3
type Version = 'V2' | 'V3' | 'V4'
type TxStatus = 'idle' | 'checking' | 'approving' | 'creating' | 'success' | 'error'

interface TokenInfo {
  address: string
  symbol: string
  decimals: number
  balance?: string
}

interface FlowState {
  step: Step
  // Step 1: Token & Fee Selection
  version: Version
  token0Address: string
  token1Address: string
  token0Info: TokenInfo | null
  token1Info: TokenInfo | null
  fee: number
  poolExists: boolean | null
  currentPoolPrice: number | null
  currentPoolPriceDisplay: string | null
  // Step 2: Price Setting (USD-based)
  token0UsdPrice: string // User-set USD price for token0
  token1UsdPrice: number | null // Fetched USD price for token1 (auto-populated)
  token0FetchedUsdPrice: number | null // Fetched USD price for token0 (if available)
  // Step 3: Deposit & Confirm
  amount0: string
  amount1: string
  token0NeedsApproval: boolean
  token1NeedsApproval: boolean
  token0Approved: boolean
  token1Approved: boolean
  txStatus: TxStatus
  txError: string | null
}

const COMMON_TOKENS = [
  { address: ARBME_ADDRESS, symbol: 'ARBME' },
  { address: WETH_ADDRESS, symbol: 'WETH' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' },
]

const SPENDERS: Record<Version, string> = {
  V2: V2_ROUTER,
  V3: V3_POSITION_MANAGER,
  V4: V4_POSITION_MANAGER,
}

const STEPS = [
  { number: 1, label: 'Tokens' },
  { number: 2, label: 'Price' },
  { number: 3, label: 'Deposit' },
]

export default function AddLiquidityPage() {
  const wallet = useWallet()
  const isFarcaster = useIsFarcaster()

  // Wagmi hooks for browser wallet
  const { sendTransactionAsync } = useSendTransaction()

  const [state, setState] = useState<FlowState>({
    step: 1,
    version: 'V4',
    token0Address: ARBME_ADDRESS,
    token1Address: WETH_ADDRESS,
    token0Info: null,
    token1Info: null,
    fee: 3000,
    poolExists: false, // Default to false so users can proceed immediately
    currentPoolPrice: null,
    currentPoolPriceDisplay: null,
    token0UsdPrice: '',
    token1UsdPrice: null,
    token0FetchedUsdPrice: null,
    amount0: '',
    amount1: '',
    token0NeedsApproval: false,
    token1NeedsApproval: false,
    token0Approved: false,
    token1Approved: false,
    txStatus: 'idle',
    txError: null,
  })

  const [loadingPrices, setLoadingPrices] = useState(false)

  const [checkingPool, setCheckingPool] = useState(false)
  const [checkingApprovals, setCheckingApprovals] = useState(false)
  const [approvingToken, setApprovingToken] = useState<'token0' | 'token1' | null>(null)

  // Update helper
  const updateState = useCallback((updates: Partial<FlowState>) => {
    setState(prev => ({ ...prev, ...updates }))
  }, [])

  // Fetch token info
  useEffect(() => {
    async function fetchTokenInfo(address: string, setter: (info: TokenInfo | null) => void) {
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        setter(null)
        return
      }

      try {
        const res = await fetch(`${API_BASE}/token-info?address=${address}`)
        if (res.ok) {
          const data = await res.json()
          setter(data)
        }
      } catch (err) {
        console.error('Failed to fetch token info:', err)
      }
    }

    fetchTokenInfo(state.token0Address, (info) => updateState({ token0Info: info }))
    fetchTokenInfo(state.token1Address, (info) => updateState({ token1Info: info }))
  }, [state.token0Address, state.token1Address, updateState])

  // Check pool exists when tokens/version/fee change
  useEffect(() => {
    async function checkPool() {
      if (!state.token0Info || !state.token1Info) {
        updateState({ poolExists: null, currentPoolPrice: null, currentPoolPriceDisplay: null })
        return
      }

      setCheckingPool(true)
      try {
        const res = await fetch(`${API_BASE}/check-pool-exists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: state.version.toLowerCase(),
            token0: state.token0Info.address,
            token1: state.token1Info.address,
            fee: state.version !== 'V2' ? state.fee : undefined,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          updateState({ poolExists: data.exists })

          // If pool exists, fetch current price
          if (data.exists) {
            const priceRes = await fetch(`${API_BASE}/pool-price`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                version: state.version.toLowerCase(),
                token0: state.token0Info.address,
                token1: state.token1Info.address,
                fee: state.version !== 'V2' ? state.fee : undefined,
              }),
            })

            if (priceRes.ok) {
              const priceData = await priceRes.json()
              updateState({
                currentPoolPrice: priceData.price,
                currentPoolPriceDisplay: priceData.priceDisplay,
              })
            }
          } else {
            updateState({ currentPoolPrice: null, currentPoolPriceDisplay: null })
          }
        }
      } catch (err) {
        console.error('Failed to check pool:', err)
      } finally {
        setCheckingPool(false)
      }
    }

    checkPool()
  }, [state.token0Info, state.token1Info, state.version, state.fee, updateState])

  // Fetch USD prices for both tokens when entering step 2
  useEffect(() => {
    async function fetchUsdPrices() {
      if (state.step !== 2 || !state.token0Info || !state.token1Info) return

      setLoadingPrices(true)
      try {
        const addresses = `${state.token0Info.address},${state.token1Info.address}`
        const res = await fetch(`${API_BASE}/token-price?addresses=${addresses}`)

        if (res.ok) {
          const data = await res.json()
          const prices = data.prices || {}
          const token0Price = prices[state.token0Info.address.toLowerCase()] || 0
          const token1Price = prices[state.token1Info.address.toLowerCase()] || 0

          updateState({
            token0FetchedUsdPrice: token0Price,
            token1UsdPrice: token1Price,
            // Pre-fill token0 USD price if we have a fetched price (formatted without scientific notation)
            token0UsdPrice: token0Price > 0 ? formatDecimal(token0Price) : state.token0UsdPrice,
          })
        }
      } catch (err) {
        console.error('Failed to fetch USD prices:', err)
      } finally {
        setLoadingPrices(false)
      }
    }

    fetchUsdPrices()
  }, [state.step, state.token0Info?.address, state.token1Info?.address])

  // Fetch balances when wallet connects and on step 3 (deposit step)
  useEffect(() => {
    async function fetchBalances() {
      if (!wallet || !state.token0Info || !state.token1Info) return

      try {
        const [bal0, bal1] = await Promise.all([
          fetch(`${API_BASE}/token-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenAddress: state.token0Info.address, walletAddress: wallet }),
          }).then(r => r.json()),
          fetch(`${API_BASE}/token-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenAddress: state.token1Info.address, walletAddress: wallet }),
          }).then(r => r.json()),
        ])

        updateState({
          token0Info: state.token0Info ? { ...state.token0Info, balance: bal0.balanceFormatted } : null,
          token1Info: state.token1Info ? { ...state.token1Info, balance: bal1.balanceFormatted } : null,
        })
      } catch (err) {
        console.error('Failed to fetch balances:', err)
      }
    }

    if (state.step === 3) {
      fetchBalances()
    }
  }, [wallet, state.token0Info?.address, state.token1Info?.address, state.step])

  // Check approvals when amounts are entered in step 3
  useEffect(() => {
    async function checkApprovals() {
      // Only check when on step 3 with valid amounts
      if (state.step !== 3 || !wallet || !state.token0Info || !state.token1Info) return
      if (!state.amount0 || !state.amount1 || parseFloat(state.amount0) <= 0 || parseFloat(state.amount1) <= 0) return

      setCheckingApprovals(true)
      try {
        const spender = SPENDERS[state.version]
        const amount0Wei = parseFloat(state.amount0) * Math.pow(10, state.token0Info.decimals)
        const amount1Wei = parseFloat(state.amount1) * Math.pow(10, state.token1Info.decimals)

        const res = await fetch(`${API_BASE}/check-approvals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token0: state.token0Info.address,
            token1: state.token1Info.address,
            owner: wallet,
            spender,
            amount0Required: amount0Wei.toFixed(0),
            amount1Required: amount1Wei.toFixed(0),
          }),
        })

        if (res.ok) {
          const data = await res.json()
          updateState({
            token0NeedsApproval: data.token0.needsApproval,
            token1NeedsApproval: data.token1.needsApproval,
            token0Approved: !data.token0.needsApproval,
            token1Approved: !data.token1.needsApproval,
          })
        } else {
          // If check-approvals fails, assume approvals are needed
          console.error('check-approvals returned', res.status)
          updateState({
            token0NeedsApproval: true,
            token1NeedsApproval: true,
            token0Approved: false,
            token1Approved: false,
          })
        }
      } catch (err) {
        console.error('Failed to check approvals:', err)
        // On error, assume approvals are needed
        updateState({
          token0NeedsApproval: true,
          token1NeedsApproval: true,
          token0Approved: false,
          token1Approved: false,
        })
      } finally {
        setCheckingApprovals(false)
      }
    }

    // Debounce the approval check
    const timer = setTimeout(checkApprovals, 500)
    return () => clearTimeout(timer)
  }, [state.step, wallet, state.token0Info, state.token1Info, state.amount0, state.amount1, state.version, updateState])

  const sendTransaction = async (tx: { to: string; data: string; value: string }) => {
    if (!wallet) throw new Error('No wallet connected')

    try {
      if (isFarcaster) {
        // Use Farcaster SDK for miniapp
        const provider = await sdk.wallet.getEthereumProvider()
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
    } catch (err: any) {
      // Handle RPC errors - they may have nested error structures
      const message = err?.message || err?.shortMessage || err?.error?.message || 'Transaction failed'
      throw new Error(message)
    }
  }

  const handleApprove = async (token: 'token0' | 'token1') => {
    if (!wallet || !state.token0Info || !state.token1Info) return

    setApprovingToken(token)
    try {
      const tokenInfo = token === 'token0' ? state.token0Info : state.token1Info
      const spender = SPENDERS[state.version]

      const res = await fetch(`${API_BASE}/build-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenInfo.address,
          spender,
          unlimited: true,
        }),
      })

      if (!res.ok) {
        let errorMsg = 'Failed to build approval'
        try {
          const data = await res.json()
          errorMsg = data?.error || errorMsg
        } catch {}
        throw new Error(errorMsg)
      }

      const data = await res.json()
      const { transaction } = data
      if (!transaction) {
        throw new Error('No transaction returned from API')
      }
      await sendTransaction(transaction)

      if (token === 'token0') {
        updateState({ token0Approved: true, token0NeedsApproval: false })
      } else {
        updateState({ token1Approved: true, token1NeedsApproval: false })
      }
    } catch (err: any) {
      console.error('Approval failed:', err)
      updateState({ txError: err.message || 'Approval failed' })
    } finally {
      setApprovingToken(null)
    }
  }

  const handleCreatePool = async () => {
    if (!wallet || !state.token0Info || !state.token1Info || !state.amount0 || !state.amount1) return

    // Calculate price ratio from USD prices for new pools, or use current pool price
    const priceRatio = state.poolExists && state.currentPoolPrice
      ? state.currentPoolPrice
      : (state.token0UsdPrice && state.token1UsdPrice
          ? parseFloat(state.token0UsdPrice) / state.token1UsdPrice
          : 0)

    if (!priceRatio || priceRatio <= 0) {
      updateState({ txError: 'Invalid price ratio' })
      return
    }

    try {
      updateState({ txStatus: 'creating', txError: null })

      const res = await fetch(`${API_BASE}/build-create-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: state.version.toLowerCase(),
          token0: state.token0Info.address,
          token1: state.token1Info.address,
          amount0: state.amount0,
          amount1: state.amount1,
          fee: state.version !== 'V2' ? state.fee : undefined,
          price: priceRatio,
          recipient: wallet,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to build transaction')
      }

      const { transactions } = await res.json()

      // Execute all transactions in sequence
      for (const tx of transactions) {
        await sendTransaction(tx)
      }

      updateState({ txStatus: 'success' })
    } catch (err: any) {
      console.error('[addLiquidity] Error:', err)
      updateState({ txError: err.message || 'Transaction failed', txStatus: 'error' })
    }
  }

  const goToStep = (step: Step) => {
    updateState({ step, txError: null })
  }

  // Validation for each step
  const isStep1Valid = state.token0Info && state.token1Info // Don't block on pool check
  const hasValidUsdPrices = state.token0UsdPrice && parseFloat(state.token0UsdPrice) > 0 && state.token1UsdPrice && state.token1UsdPrice > 0
  const isStep2Valid = state.poolExists ? true : hasValidUsdPrices // Existing pools skip price setting
  const isStep3Valid = state.amount0 && state.amount1 && parseFloat(state.amount0) > 0 && parseFloat(state.amount1) > 0
  const allApproved = state.token0Approved && state.token1Approved

  // Calculate price ratio from USD prices: token0UsdPrice / token1UsdPrice = token1 per token0
  const calculatedPriceRatio = hasValidUsdPrices
    ? parseFloat(state.token0UsdPrice) / state.token1UsdPrice!
    : null

  // For existing pools, use the current pool price; for new pools, use calculated ratio
  const effectivePriceRatio = state.poolExists && state.currentPoolPrice
    ? state.currentPoolPrice
    : calculatedPriceRatio

  // Get fee tier label
  const getFeeTierLabel = (fee: number) => {
    const tiers = state.version === 'V3' ? V3_FEE_TIERS : V4_FEE_TIERS
    const tier = tiers.find(t => t.value === fee)
    return tier ? tier.label : `${fee / 10000}%`
  }

  // Format USD price for display
  const formatUsd = (price: number) => {
    if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `$${formatDecimal(price)}`
  }

  // Render Step 1: Token & Fee Selection
  const renderStep1 = () => (
    <div className="step-content">
      <div className="create-pool-card">
        {/* Version Selector */}
        <div className="create-section">
          <h3 className="section-title">Protocol Version</h3>
          <div className="version-selector">
            {(['V2', 'V3', 'V4'] as Version[]).map((v) => (
              <button
                key={v}
                className={`version-btn ${state.version === v ? 'selected' : ''}`}
                onClick={() => updateState({ version: v })}
              >
                <span className={`version-badge ${v.toLowerCase()}`}>{v}</span>
                <span className="version-desc">
                  {v === 'V2' && 'Simple'}
                  {v === 'V3' && 'Concentrated'}
                  {v === 'V4' && 'Hooks'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Token Selection */}
        <div className="create-section">
          <h3 className="section-title">Token Pair</h3>
          <div className="token-selector-group">
            <label className="token-selector-label">Token 1</label>
            <select
              className="token-select"
              value={COMMON_TOKENS.find(t => t.address === state.token0Address) ? state.token0Address : ''}
              onChange={(e) => updateState({ token0Address: e.target.value })}
            >
              {COMMON_TOKENS.map((t) => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
              <option value="">Custom...</option>
            </select>
            {!COMMON_TOKENS.find(t => t.address === state.token0Address) && (
              <input
                type="text"
                className="token-custom-input"
                placeholder="Enter token address"
                value={state.token0Address}
                onChange={(e) => updateState({ token0Address: e.target.value })}
              />
            )}
            {state.token0Info && (
              <div className="token-selected-info">
                <span className="token-symbol">{state.token0Info.symbol}</span>
              </div>
            )}
          </div>

          <div className="token-selector-group">
            <label className="token-selector-label">Token 2</label>
            <select
              className="token-select"
              value={COMMON_TOKENS.find(t => t.address === state.token1Address) ? state.token1Address : ''}
              onChange={(e) => updateState({ token1Address: e.target.value })}
            >
              {COMMON_TOKENS.map((t) => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
              <option value="">Custom...</option>
            </select>
            {!COMMON_TOKENS.find(t => t.address === state.token1Address) && (
              <input
                type="text"
                className="token-custom-input"
                placeholder="Enter token address"
                value={state.token1Address}
                onChange={(e) => updateState({ token1Address: e.target.value })}
              />
            )}
            {state.token1Info && (
              <div className="token-selected-info">
                <span className="token-symbol">{state.token1Info.symbol}</span>
              </div>
            )}
          </div>
        </div>

        {/* Fee Tier (V3/V4 only) */}
        {state.version !== 'V2' && (
          <div className="create-section">
            <h3 className="section-title">Fee Tier</h3>
            <FeeTierSelector
              value={state.fee}
              onChange={(fee) => updateState({ fee })}
              tiers={state.version === 'V3' ? V3_FEE_TIERS : V4_FEE_TIERS}
            />
          </div>
        )}

        {/* Pool Status */}
        {state.token0Info && state.token1Info && (
          <div className="create-section">
            <div className={`fee-warning`} style={{
              background: checkingPool ? 'rgba(100, 100, 100, 0.1)' : state.poolExists ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 193, 7, 0.1)',
              borderColor: checkingPool ? 'var(--border)' : state.poolExists ? 'var(--positive)' : 'rgba(255, 193, 7, 0.3)',
              color: checkingPool ? 'var(--text-muted)' : state.poolExists ? 'var(--positive)' : '#ffb84d',
            }}>
              {checkingPool ? (
                'Checking pool status...'
              ) : state.poolExists ? (
                <>Pool exists - adding to existing liquidity</>
              ) : (
                'New pool - you will set the initial price'
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="step-navigation">
          <button
            className="btn-next"
            onClick={() => goToStep(2)}
            disabled={!isStep1Valid}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )

  // Render Step 2: Price Setting (USD-based)
  const renderStep2 = () => (
    <div className="step-content">
      <div className="create-pool-card">
        {/* Pool Info Banner */}
        <div className="pool-info-banner">
          <div className="pool-info-icon">
            {state.poolExists ? '💧' : '✨'}
          </div>
          <div className="pool-info-content">
            <div className="pool-info-pair">
              {state.token0Info?.symbol} / {state.token1Info?.symbol}
              {state.version !== 'V2' && ` (${getFeeTierLabel(state.fee)})`}
            </div>
            <div className={`pool-info-status ${state.poolExists ? 'exists' : 'new'}`}>
              {state.poolExists ? 'Adding to existing pool' : 'Creating new pool'}
            </div>
          </div>
          <span className={`version-badge ${state.version.toLowerCase()}`}>{state.version}</span>
        </div>

        {/* Pool Exists - Show current price */}
        {state.poolExists && (
          <div className="create-section">
            <h3 className="section-title">Current Pool Price</h3>
            {state.currentPoolPriceDisplay && (
              <div className="current-price-display">
                <div className="current-price-label">Market Price</div>
                <div className="current-price-value">{state.currentPoolPriceDisplay}</div>
              </div>
            )}
            <div className="fee-warning" style={{
              background: 'rgba(34, 197, 94, 0.1)',
              borderColor: 'var(--positive)',
              color: 'var(--positive)',
              marginTop: 'var(--spacing-md)',
            }}>
              This pool already exists. Your liquidity will be added at the current market price.
            </div>
          </div>
        )}

        {/* New Pool - USD Price Setting */}
        {!state.poolExists && (
          <div className="create-section">
            <h3 className="section-title">Set Token Price (USD)</h3>

            {loadingPrices ? (
              <div className="loading-state" style={{ padding: '1rem' }}>
                <div className="loading-spinner" />
                <p>Fetching market prices...</p>
              </div>
            ) : (
              <div className="price-input-section">
                {/* Token 0 USD Price */}
                <div className="input-group">
                  <label className="input-label">
                    <span>{state.token0Info?.symbol} Price (USD)</span>
                    {state.token0FetchedUsdPrice && state.token0FetchedUsdPrice > 0 && (
                      <span className="input-hint" style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                        Market: {formatUsd(state.token0FetchedUsdPrice)}
                      </span>
                    )}
                  </label>
                  <div className="input-wrapper">
                    <span className="input-prefix">$</span>
                    <input
                      type="number"
                      className="amount-input"
                      placeholder="0.00"
                      value={state.token0UsdPrice}
                      onChange={(e) => updateState({ token0UsdPrice: e.target.value })}
                      step="any"
                    />
                  </div>
                </div>

                {/* Token 1 USD Price (read-only, fetched) */}
                <div className="input-group">
                  <label className="input-label">
                    <span>{state.token1Info?.symbol} Price (USD)</span>
                    <span className="input-hint" style={{ color: 'var(--positive)', marginLeft: '0.5rem' }}>
                      Auto-fetched
                    </span>
                  </label>
                  <div className="input-wrapper" style={{ opacity: 0.7 }}>
                    <span className="input-prefix">$</span>
                    <input
                      type="text"
                      className="amount-input"
                      value={state.token1UsdPrice ? state.token1UsdPrice.toFixed(2) : 'Loading...'}
                      disabled
                    />
                  </div>
                </div>

                {/* Calculated Price Ratio */}
                {calculatedPriceRatio && calculatedPriceRatio > 0 && (
                  <div className="initial-price-display">
                    <span className="price-label">Calculated Pool Price</span>
                    <span className="price-value">
                      1 {state.token0Info?.symbol} = {calculatedPriceRatio.toFixed(10)} {state.token1Info?.symbol}
                    </span>
                  </div>
                )}

                <div className="fee-warning" style={{
                  background: 'rgba(255, 193, 7, 0.1)',
                  borderColor: 'rgba(255, 193, 7, 0.3)',
                  color: '#ffb84d',
                  marginTop: 'var(--spacing-md)',
                }}>
                  You are setting the initial price for this pool. The price ratio is calculated from the USD values you enter.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="step-navigation">
          <button className="btn-back" onClick={() => goToStep(1)}>
            Back
          </button>
          <button
            className="btn-next"
            onClick={() => goToStep(3)}
            disabled={!isStep2Valid || loadingPrices}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )

  // Render Step 3: Deposit & Confirm
  const renderStep3 = () => {
    // Success state
    if (state.txStatus === 'success') {
      return (
        <div className="step-content">
          <div className="create-pool-card">
            <div className="success-state">
              <div className="success-icon">✅</div>
              <h2 className="success-title">Position Created!</h2>
              <p className="success-message">
                Your liquidity has been successfully added to the {state.token0Info?.symbol}/{state.token1Info?.symbol} pool.
              </p>
              <div className="success-actions">
                <Link href={ROUTES.MY_POOLS} className="button-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
                  View My Positions
                </Link>
                <Link href={ROUTES.HOME} className="button-secondary" style={{ textAlign: 'center', textDecoration: 'none' }}>
                  Back to Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="step-content">
        <div className="create-pool-card">
          {/* Pool Info Banner */}
          <div className="pool-info-banner">
            <div className="pool-info-icon">
              {state.poolExists ? '💧' : '✨'}
            </div>
            <div className="pool-info-content">
              <div className="pool-info-pair">
                {state.token0Info?.symbol} / {state.token1Info?.symbol}
                {state.version !== 'V2' && ` (${getFeeTierLabel(state.fee)})`}
              </div>
              <div className="pool-info-price">
                Price: 1 {state.token0Info?.symbol} = {effectivePriceRatio?.toFixed(10)} {state.token1Info?.symbol}
              </div>
            </div>
            <span className={`version-badge ${state.version.toLowerCase()}`}>{state.version}</span>
          </div>

          {/* Deposit Amounts */}
          <div className="create-section">
            <h3 className="section-title">Deposit Amounts</h3>
            <p className="section-hint" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--spacing-md)' }}>
              Amounts are linked based on the price ratio
            </p>
            <div className="amount-inputs">
              <TokenInput
                label={state.token0Info?.symbol || 'Token 1'}
                symbol={state.token0Info?.symbol}
                balance={state.token0Info?.balance}
                value={state.amount0}
                onChange={(amount0) => {
                  // Auto-calculate amount1 based on price ratio
                  if (effectivePriceRatio && amount0 && parseFloat(amount0) > 0) {
                    const calculatedAmount1 = parseFloat(amount0) * effectivePriceRatio
                    updateState({ amount0, amount1: formatDecimal(calculatedAmount1) })
                  } else {
                    updateState({ amount0 })
                  }
                }}
              />

              <TokenInput
                label={state.token1Info?.symbol || 'Token 2'}
                symbol={state.token1Info?.symbol}
                balance={state.token1Info?.balance}
                value={state.amount1}
                onChange={(amount1) => {
                  // Auto-calculate amount0 based on price ratio
                  if (effectivePriceRatio && effectivePriceRatio > 0 && amount1 && parseFloat(amount1) > 0) {
                    const calculatedAmount0 = parseFloat(amount1) / effectivePriceRatio
                    updateState({ amount1, amount0: formatDecimal(calculatedAmount0) })
                  } else {
                    updateState({ amount1 })
                  }
                }}
              />
            </div>
          </div>

          {/* Approvals Section */}
          {isStep3Valid && (
            <div className="approval-section">
              <h3 className="approval-title">Approvals</h3>

              {checkingApprovals ? (
                <div className="loading-state" style={{ padding: '1rem' }}>
                  <div className="loading-spinner" />
                  <p>Checking approvals...</p>
                </div>
              ) : (
                <>
                  {/* Token 0 Approval */}
                  <div className="approval-item">
                    <div className="approval-token">
                      <span className="approval-token-symbol">{state.token0Info?.symbol}</span>
                    </div>
                    {state.token0Approved ? (
                      <div className="approval-status">
                        <span className="approval-check">✓</span>
                        <span className="approval-text">Approved</span>
                      </div>
                    ) : (
                      <button
                        className={`approval-btn ${approvingToken === 'token0' ? 'pending' : ''}`}
                        onClick={() => handleApprove('token0')}
                        disabled={approvingToken !== null}
                      >
                        {approvingToken === 'token0' ? (
                          <>
                            <span className="loading-spinner small" style={{ marginRight: '0.5rem' }} />
                            Approving...
                          </>
                        ) : (
                          'Approve'
                        )}
                      </button>
                    )}
                  </div>

                  {/* Token 1 Approval */}
                  <div className="approval-item">
                    <div className="approval-token">
                      <span className="approval-token-symbol">{state.token1Info?.symbol}</span>
                    </div>
                    {state.token1Approved ? (
                      <div className="approval-status">
                        <span className="approval-check">✓</span>
                        <span className="approval-text">Approved</span>
                      </div>
                    ) : (
                      <button
                        className={`approval-btn ${approvingToken === 'token1' ? 'pending' : ''}`}
                        onClick={() => handleApprove('token1')}
                        disabled={approvingToken !== null}
                      >
                        {approvingToken === 'token1' ? (
                          <>
                            <span className="loading-spinner small" style={{ marginRight: '0.5rem' }} />
                            Approving...
                          </>
                        ) : (
                          'Approve'
                        )}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Error Display */}
          {state.txError && (
            <div className="tx-error" style={{ marginBottom: '1rem' }}>
              {state.txError}
            </div>
          )}

          {/* Navigation / Submit */}
          <div className="step-navigation">
            <button
              className="btn-back"
              onClick={() => goToStep(2)}
              disabled={state.txStatus === 'creating'}
            >
              Back
            </button>
            <button
              className="btn-next"
              onClick={handleCreatePool}
              disabled={!isStep3Valid || !allApproved || state.txStatus === 'creating' || checkingApprovals}
            >
              {state.txStatus === 'creating' ? (
                <>
                  <span className="loading-spinner small" style={{ marginRight: '0.5rem' }} />
                  Creating...
                </>
              ) : state.poolExists ? (
                'Add Liquidity'
              ) : (
                'Create Pool'
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back to Home" />

        <div className="section-header">
          <h2>Add Liquidity</h2>
        </div>

        {!wallet ? (
          <div className="empty-state">
            <p>Connect your wallet to add liquidity</p>
            <p className="hint">Your wallet will connect automatically in Farcaster</p>
          </div>
        ) : (
          <>
            <StepIndicator steps={STEPS} currentStep={state.step} />

            {state.step === 1 && renderStep1()}
            {state.step === 2 && renderStep2()}
            {state.step === 3 && renderStep3()}
          </>
        )}
      </div>

      <Footer />
    </div>
  )
}
