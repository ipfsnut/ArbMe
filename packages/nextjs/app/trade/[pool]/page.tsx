'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useWallet, useIsFarcaster, useIsSafe } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { useSendTransaction } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'

const API_BASE = '/api'

type TxStatus = 'idle' | 'building' | 'pending' | 'success' | 'error'

interface TokenInfo {
  address: string
  symbol: string
  decimals: number
}

interface SwapQuote {
  amountOut: string
  priceImpact: number
  executionPrice: number
  gasEstimate?: string
  quotedVia?: 'quoter' | 'spot-math'
  // V4 detected pool params (used when building swap tx)
  hooks?: string
  fee?: number
  tickSpacing?: number
}

export default function TradePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const wallet = useWallet()
  const isFarcaster = useIsFarcaster()
  const isSafe = useIsSafe()
  const { sendTransactionAsync } = useSendTransaction()

  const poolAddress = params.pool as string

  // Parse query params
  const token0Address = searchParams.get('t0') || ''
  const token1Address = searchParams.get('t1') || ''
  const version = (searchParams.get('v') || 'V4') as 'V2' | 'V3' | 'V4'
  const fee = parseInt(searchParams.get('fee') || '3000', 10)
  const tickSpacing = parseInt(searchParams.get('ts') || '60', 10)
  const hooks = searchParams.get('hooks') || ''
  const pairName = searchParams.get('pair') || 'Token Swap'

  // Token info state
  const [token0, setToken0] = useState<TokenInfo | null>(null)
  const [token1, setToken1] = useState<TokenInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // Swap state
  const [swapDirection, setSwapDirection] = useState<'0to1' | '1to0'>('0to1')
  const [swapAmount, setSwapAmount] = useState('')
  const [swapStatus, setSwapStatus] = useState<TxStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Slippage settings
  const [slippage, setSlippage] = useState(0.5) // percent
  const [showSlippageSettings, setShowSlippageSettings] = useState(false)
  const [customSlippage, setCustomSlippage] = useState('')

  // Quote state (fetched from /api/quote)
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const quoteAbortRef = useRef<AbortController | null>(null)

  // Approval state
  const [needsApproval, setNeedsApproval] = useState(false)
  const [approvalLoading, setApprovalLoading] = useState(false)

  // Balance state
  const [balanceIn, setBalanceIn] = useState<string | null>(null) // formatted (human-readable)
  const [balanceInWei, setBalanceInWei] = useState<string | null>(null)

  // Computed values
  const tokenIn = swapDirection === '0to1' ? token0 : token1
  const tokenOut = swapDirection === '0to1' ? token1 : token0
  const decimalsIn = tokenIn?.decimals || 18
  const decimalsOut = tokenOut?.decimals || 18

  // Parse amount using viem's parseUnits (no float precision loss)
  const amountInWei = (() => {
    if (!swapAmount || swapAmount === '0' || swapAmount === '') return '0'
    try {
      return parseUnits(swapAmount, decimalsIn).toString()
    } catch {
      return '0'
    }
  })()

  // ═══════════════════════════════════════════════════════════════════════════
  // Fetch quote from /api/quote (debounced)
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchQuote = useCallback(async (amount: string) => {
    if (!tokenIn || !tokenOut || amount === '0') {
      setSwapQuote(null)
      setQuoteError(null)
      return
    }

    // Abort any in-flight request
    quoteAbortRef.current?.abort()
    const controller = new AbortController()
    quoteAbortRef.current = controller

    setQuoteLoading(true)
    setQuoteError(null)

    try {
      const res = await fetch(`${API_BASE}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress,
          version,
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn: amount,
          fee,
          tickSpacing,
          ...(hooks && { hooks }),
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to get quote')
      }

      const quote: SwapQuote = await res.json()
      setSwapQuote(quote)
      setQuoteError(null)
    } catch (err: any) {
      if (err.name === 'AbortError') return // Superseded by newer request
      console.error('[TradePage] Quote error:', err)
      setQuoteError(err.message || 'Failed to get quote')
      setSwapQuote(null)
    } finally {
      setQuoteLoading(false)
    }
  }, [tokenIn, tokenOut, poolAddress, version, fee, tickSpacing, hooks])

  // Quote refresh countdown
  const QUOTE_REFRESH_INTERVAL = 12 // seconds
  const [quoteCountdown, setQuoteCountdown] = useState(QUOTE_REFRESH_INTERVAL)

  // Debounce quote fetches (300ms after user stops typing) + auto-refresh
  useEffect(() => {
    if (amountInWei === '0') {
      setSwapQuote(null)
      setQuoteError(null)
      setQuoteLoading(false)
      setQuoteCountdown(QUOTE_REFRESH_INTERVAL)
      return
    }

    // Initial fetch (debounced)
    const debounceTimer = setTimeout(() => {
      fetchQuote(amountInWei)
      setQuoteCountdown(QUOTE_REFRESH_INTERVAL)
    }, 300)

    // Auto-refresh interval
    const refreshTimer = setInterval(() => {
      fetchQuote(amountInWei)
      setQuoteCountdown(QUOTE_REFRESH_INTERVAL)
    }, QUOTE_REFRESH_INTERVAL * 1000)

    // Countdown ticker
    const countdownTimer = setInterval(() => {
      setQuoteCountdown((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => {
      clearTimeout(debounceTimer)
      clearInterval(refreshTimer)
      clearInterval(countdownTimer)
    }
  }, [amountInWei, fetchQuote])

  // ═══════════════════════════════════════════════════════════════════════════
  // Fetch tokenIn balance
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!wallet || !tokenIn) {
      setBalanceIn(null)
      setBalanceInWei(null)
      return
    }

    let cancelled = false

    async function fetchBalance() {
      try {
        const res = await fetch(`${API_BASE}/token-balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenAddress: tokenIn!.address,
            walletAddress: wallet,
          }),
        })

        if (!res.ok) return
        const data = await res.json()

        if (!cancelled) {
          setBalanceIn(data.balanceFormatted)
          setBalanceInWei(data.balanceWei)
        }
      } catch (err) {
        console.error('[TradePage] Balance fetch error:', err)
      }
    }

    fetchBalance()
    return () => { cancelled = true }
  }, [wallet, tokenIn])

  // ═══════════════════════════════════════════════════════════════════════════
  // Approval check + execute
  // ═══════════════════════════════════════════════════════════════════════════

  // Spender for ERC20 approval (V2/V3: router, V4: Permit2)
  const approvalSpender = (() => {
    switch (version) {
      case 'V2': return '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24'
      case 'V3': return '0x2626664c2603336E57B271c5C0b26F421741e481'
      case 'V4': return '0x000000000022D473030F116dDEE9F6B43aC78BA3' // Permit2
    }
  })()

  // Check allowance when quote is ready
  useEffect(() => {
    if (!wallet || !tokenIn || amountInWei === '0' || !swapQuote) {
      setNeedsApproval(false)
      return
    }

    let cancelled = false

    async function checkAllowance() {
      try {
        const res = await fetch(`${API_BASE}/check-approvals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token0: tokenIn!.address,
            token1: tokenIn!.address, // only checking tokenIn
            owner: wallet,
            spender: approvalSpender,
            amount0Required: amountInWei,
            amount1Required: '0',
          }),
        })

        if (!res.ok) return
        const data = await res.json()

        if (!cancelled) {
          setNeedsApproval(data.token0?.needsApproval || false)
        }
      } catch (err) {
        console.error('[TradePage] Approval check error:', err)
      }
    }

    checkAllowance()
    return () => { cancelled = true }
  }, [wallet, tokenIn, amountInWei, swapQuote, approvalSpender])

  const handleApprove = async () => {
    if (!tokenIn || !wallet) return

    setApprovalLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/build-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenIn.address,
          spender: approvalSpender,
          unlimited: true,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to build approval')
      }

      const { transaction } = await res.json()
      await sendTransaction(transaction)

      // Re-check allowance after approval
      setNeedsApproval(false)
    } catch (err: any) {
      console.error('[TradePage] Approval error:', err)
      setError(err.message || 'Approval failed')
    } finally {
      setApprovalLoading(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Fetch token info on mount
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    async function fetchTokenInfo() {
      if (!token0Address || !token1Address) {
        setLoading(false)
        return
      }

      try {
        const [t0Info, t1Info] = await Promise.all([
          getTokenInfo(token0Address),
          getTokenInfo(token1Address),
        ])

        setToken0(t0Info)
        setToken1(t1Info)
      } catch (err) {
        console.error('[TradePage] Error fetching token info:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTokenInfo()
  }, [token0Address, token1Address])

  async function getTokenInfo(address: string): Promise<TokenInfo> {
    const knownTokens: Record<string, { symbol: string; decimals: number }> = {
      // Core Ecosystem
      '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07': { symbol: 'ARBME', decimals: 18 },
      '0x392bc5deea227043d69af0e67badcbbaed511b07': { symbol: 'RATCHET', decimals: 18 },
      '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292': { symbol: 'CHAOS', decimals: 18 },
      '0x8c19a8b92fa406ae097eb9ea8a4a44cbc10eafe2': { symbol: 'ALPHACLAW', decimals: 18 },
      '0x5c0872b790bb73e2b3a9778db6e7704095624b07': { symbol: 'ABC', decimals: 18 },
      '0xc4730f86d1f86ce0712a7b17ee919db7defad7fe': { symbol: 'PAGE', decimals: 18 },
      // Connected Tokens
      '0xa448d40f6793773938a6b7427091c35676899125': { symbol: 'MLTL', decimals: 18 },
      '0xb695559b26bb2c9703ef1935c37aeae9526bab07': { symbol: 'MOLT', decimals: 18 },
      '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb': { symbol: 'CLANKER', decimals: 18 },
      '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b': { symbol: 'BNKR', decimals: 18 },
      '0x53ad48291407e16e29822deb505b30d47f965ebb': { symbol: 'CLAWD', decimals: 18 },
      '0xf3bb567d4c79cb32d92b9db151255cdd3b91f04a': { symbol: 'OPENCLAW', decimals: 18 },
      '0xc3a366c03a0fc57d96065e3adb27dd0036d83b80': { symbol: 'WOLF', decimals: 18 },
      '0x1966a17d806a79f742e6e228ecc9421f401a8a32': { symbol: 'EDGE', decimals: 18 },
      '0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e': { symbol: 'OSO', decimals: 18 },
      '0x01de044ad8eb037334ddda97a38bb0c798e4eb07': { symbol: 'CNEWS', decimals: 18 },
      // Base Assets
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
      '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
      '0x000000000d564d5be76f7f0d28fe52605afc7cf8': { symbol: 'flETH', decimals: 18 },
    }

    const lowerAddr = address.toLowerCase()
    if (knownTokens[lowerAddr]) {
      return { address, ...knownTokens[lowerAddr] }
    }

    return {
      address,
      symbol: address.slice(0, 6) + '...',
      decimals: 18,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Transaction handling
  // ═══════════════════════════════════════════════════════════════════════════

  const sendTransaction = async (tx: { to: string; data: string; value: string }) => {
    if (!wallet) throw new Error('No wallet connected')

    try {
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
        const txHash = await sendTransactionAsync({
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: tx.value !== '0' ? BigInt(tx.value) : 0n,
        })

        return txHash
      }
    } catch (err: any) {
      const message = err?.message || err?.shortMessage || err?.error?.message || 'Transaction failed'
      throw new Error(message)
    }
  }

  const handleExecuteSwap = async () => {
    if (!tokenIn || !tokenOut || !wallet || !swapQuote || !swapAmount) return

    try {
      setSwapStatus('building')
      setError(null)

      // Apply user-configured slippage to the Quoter-provided amountOut
      const slippageBps = BigInt(Math.round(slippage * 100)) // e.g., 0.5% = 50 bps
      const minAmountOut = (BigInt(swapQuote.amountOut) * (10000n - slippageBps) / 10000n).toString()

      // Use detected pool params from quote response (V4 auto-detection)
      const swapFee = swapQuote.fee || fee
      const swapTickSpacing = swapQuote.tickSpacing || tickSpacing
      const swapHooks = swapQuote.hooks || hooks

      const res = await fetch(`${API_BASE}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress,
          version,
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn: amountInWei,
          minAmountOut,
          recipient: wallet,
          fee: swapFee,
          tickSpacing: swapTickSpacing,
          ...(swapHooks && { hooks: swapHooks }),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to build swap transaction')
      }

      const { transaction } = await res.json()

      setSwapStatus('pending')
      const hash = await sendTransaction(transaction)
      setTxHash(typeof hash === 'string' ? hash : null)
      setSwapStatus('success')
      setSwapAmount('')
    } catch (err: any) {
      console.error('[executeSwap] Error:', err)
      setError(err.message || 'Swap failed')
      setSwapStatus('error')
    }
  }

  const formatAmount = (amount: number | undefined, maxDecimals: number = 6) => {
    if (amount === undefined || amount === null) return '0'
    if (amount < 0.000001) return '<0.000001'
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`
    return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals })
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href="/trade" label="Back to Pools" />

        <div className="page-header">
          <h1>Trade {pairName}</h1>
          <div className="pool-meta">
            <span className={`version-badge ${version.toLowerCase()}`}>{version}</span>
            <span className="fee-badge">{(fee / 10000).toFixed(2)}% fee</span>
          </div>
        </div>

        {!wallet ? (
          <div className="empty-state">
            <p>Connect your wallet to trade</p>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading pool...</p>
          </div>
        ) : !token0 || !token1 ? (
          <div className="error-state">
            <p>Invalid pool configuration</p>
            <button onClick={() => router.push('/trade')}>Back to Pools</button>
          </div>
        ) : (
          <div className="trade-card">
            {/* Slippage Settings */}
            <div className="slippage-row">
              <span className="slippage-label">Slippage: {slippage}%</span>
              <button
                className="slippage-gear"
                onClick={() => setShowSlippageSettings(!showSlippageSettings)}
              >
                {showSlippageSettings ? 'Close' : 'Settings'}
              </button>
            </div>
            {showSlippageSettings && (
              <div className="slippage-options">
                {[0.1, 0.5, 1.0].map((s) => (
                  <button
                    key={s}
                    className={`slippage-btn ${slippage === s ? 'active' : ''}`}
                    onClick={() => { setSlippage(s); setCustomSlippage('') }}
                  >
                    {s}%
                  </button>
                ))}
                <input
                  type="number"
                  className="slippage-custom"
                  placeholder="Custom"
                  value={customSlippage}
                  onChange={(e) => {
                    setCustomSlippage(e.target.value)
                    const val = parseFloat(e.target.value)
                    if (val > 0 && val <= 50) setSlippage(val)
                  }}
                />
              </div>
            )}

            {/* Direction Toggle */}
            <div className="input-group">
              <span className="input-label">Direction</span>
              <div className="direction-toggle">
                <button
                  className={`direction-btn ${swapDirection === '0to1' ? 'active' : ''}`}
                  onClick={() => setSwapDirection('0to1')}
                  disabled={swapStatus === 'pending'}
                >
                  {token0.symbol} → {token1.symbol}
                </button>
                <button
                  className={`direction-btn ${swapDirection === '1to0' ? 'active' : ''}`}
                  onClick={() => setSwapDirection('1to0')}
                  disabled={swapStatus === 'pending'}
                >
                  {token1.symbol} → {token0.symbol}
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="input-group">
              <div className="input-label-row">
                <span className="input-label">Amount ({tokenIn?.symbol})</span>
                {balanceIn !== null && (
                  <span className="balance-display">
                    Balance: {formatAmount(parseFloat(balanceIn))}
                    <button
                      className="max-btn"
                      onClick={() => {
                        if (balanceInWei && tokenIn) {
                          setSwapAmount(formatUnits(BigInt(balanceInWei), tokenIn.decimals))
                        }
                      }}
                      disabled={swapStatus === 'pending'}
                    >
                      MAX
                    </button>
                  </span>
                )}
              </div>
              <input
                type="number"
                className="amount-input"
                placeholder="0.0"
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                disabled={swapStatus === 'pending'}
              />
            </div>

            {/* Quote Display */}
            {quoteLoading && (
              <div className="quote-loading">
                <span className="loading-spinner small" /> Getting quote...
              </div>
            )}

            {swapQuote && amountInWei !== '0' && (
              <div className="swap-quote">
                <div className="quote-row">
                  <span className="quote-label">Expected Output</span>
                  <span className="quote-value">
                    {formatAmount(Number(swapQuote.amountOut) / Math.pow(10, decimalsOut))} {tokenOut?.symbol}
                  </span>
                </div>
                <div className="quote-row">
                  <span className="quote-label">Price Impact</span>
                  <span className={`quote-value ${swapQuote.priceImpact > 5 ? 'warning' : ''}`}>
                    {swapQuote.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="quote-row">
                  <span className="quote-label">Min. Received ({slippage}% slippage)</span>
                  <span className="quote-value">
                    {formatAmount(Number(swapQuote.amountOut) * (1 - slippage / 100) / Math.pow(10, decimalsOut))} {tokenOut?.symbol}
                  </span>
                </div>
                {swapQuote.gasEstimate && (
                  <div className="quote-row">
                    <span className="quote-label">Est. Gas</span>
                    <span className="quote-value quote-muted">
                      {Number(swapQuote.gasEstimate).toLocaleString()}
                    </span>
                  </div>
                )}
                {swapQuote.priceImpact > 5 && (
                  <div className="price-impact-warning">
                    High price impact! Consider using a smaller amount.
                  </div>
                )}
                <div className="quote-refresh">
                  {quoteLoading ? (
                    <span className="quote-refresh-text">Refreshing...</span>
                  ) : (
                    <span className="quote-refresh-text">Quote refreshes in {quoteCountdown}s</span>
                  )}
                </div>
              </div>
            )}

            {/* Insufficient balance warning */}
            {balanceInWei && amountInWei !== '0' && BigInt(amountInWei) > BigInt(balanceInWei) && (
              <div className="tx-warning">
                Insufficient {tokenIn?.symbol} balance
              </div>
            )}

            {error && (
              <div className="tx-error">{error}</div>
            )}

            {quoteError && (
              <div className="tx-error">Quote error: {quoteError}</div>
            )}

            {/* Tx success confirmation */}
            {txHash && swapStatus === 'success' && (
              <div className="tx-success">
                <span>{isSafe ? 'Proposed to Safe' : 'Swap successful!'}</span>
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-link"
                >
                  View on Basescan
                </a>
                <button
                  className="tx-dismiss"
                  onClick={() => { setTxHash(null); setSwapStatus('idle') }}
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Approve / Swap Buttons */}
            {needsApproval && swapQuote ? (
              <button
                className="btn btn-secondary full-width"
                onClick={handleApprove}
                disabled={approvalLoading}
              >
                {approvalLoading ? (
                  <><span className="loading-spinner small" /> Approving {tokenIn?.symbol}...</>
                ) : (
                  `Approve ${tokenIn?.symbol}`
                )}
              </button>
            ) : swapStatus === 'success' ? null : (
              <button
                className="btn btn-primary full-width"
                onClick={handleExecuteSwap}
                disabled={
                  !swapQuote || swapStatus === 'pending' || swapStatus === 'building' || quoteLoading || needsApproval ||
                  (!!balanceInWei && amountInWei !== '0' && BigInt(amountInWei) > BigInt(balanceInWei))
                }
              >
                {swapStatus === 'building' && 'Building...'}
                {swapStatus === 'pending' && (
                  <>
                    <span className="loading-spinner small" /> Swapping...
                  </>
                )}
                {swapStatus === 'error' && 'Failed - Try Again'}
                {swapStatus === 'idle' && (swapQuote ? 'Execute Swap' : (quoteLoading ? 'Getting quote...' : 'Enter amount'))}
              </button>
            )}
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}
