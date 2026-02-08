'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useWallet, useIsFarcaster, useIsSafe } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { useSendTransaction, useReadContract } from 'wagmi'
import { keccak256, encodeAbiParameters, zeroAddress } from 'viem'

const API_BASE = '/api'

type TxStatus = 'idle' | 'building' | 'pending' | 'success' | 'error'

interface TokenInfo {
  address: string
  symbol: string
  decimals: number
}

// V3 Quoter V2 on Base
const V3_QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as const

// V4 StateView on Base
const V4_STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71' as const

// ABIs for client-side quoting
const QUOTER_V2_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{
      name: 'params',
      type: 'tuple',
      components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'fee', type: 'uint24' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ],
    }],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

const STATE_VIEW_ABI = [
  {
    name: 'getSlot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
  },
  {
    name: 'getLiquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
] as const

const V2_PAIR_ABI = [
  {
    name: 'getReserves',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
  },
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

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

  // Computed values
  const tokenIn = swapDirection === '0to1' ? token0 : token1
  const tokenOut = swapDirection === '0to1' ? token1 : token0
  const decimalsIn = tokenIn?.decimals || 18
  const decimalsOut = tokenOut?.decimals || 18

  const amountInWei = useMemo(() => {
    if (!swapAmount || parseFloat(swapAmount) <= 0) return 0n
    try {
      return BigInt(Math.floor(parseFloat(swapAmount) * Math.pow(10, decimalsIn)))
    } catch {
      return 0n
    }
  }, [swapAmount, decimalsIn])

  // V2: Read reserves for quote calculation
  const { data: v2Reserves } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: V2_PAIR_ABI,
    functionName: 'getReserves',
    query: { enabled: version === 'V2' && !!poolAddress },
  })

  const { data: v2Token0 } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: V2_PAIR_ABI,
    functionName: 'token0',
    query: { enabled: version === 'V2' && !!poolAddress },
  })

  // V3: Use Quoter contract (this is a view call simulation)
  const { data: v3Quote, isLoading: v3Loading, error: v3Error } = useReadContract({
    address: V3_QUOTER,
    abi: QUOTER_V2_ABI,
    functionName: 'quoteExactInputSingle',
    args: tokenIn && tokenOut && amountInWei > 0n ? [{
      tokenIn: tokenIn.address as `0x${string}`,
      tokenOut: tokenOut.address as `0x${string}`,
      amountIn: amountInWei,
      fee: fee,
      sqrtPriceLimitX96: 0n,
    }] : undefined,
    query: {
      enabled: version === 'V3' && !!tokenIn && !!tokenOut && amountInWei > 0n,
    },
  })

  // V4: Read pool state from StateView
  const poolId = useMemo(() => {
    if (version !== 'V4' || !token0Address || !token1Address) return undefined

    // If poolAddress is already a poolId (66 chars), use it
    if (poolAddress.startsWith('0x') && poolAddress.length === 66) {
      return poolAddress as `0x${string}`
    }

    // Compute poolId from PoolKey
    // Sort tokens - currency0 must be < currency1
    const [currency0, currency1] = token0Address.toLowerCase() < token1Address.toLowerCase()
      ? [token0Address, token1Address]
      : [token1Address, token0Address]

    // PoolId = keccak256(PoolKey)
    // Use tickSpacing from URL params (outer scope) — NOT a hardcoded lookup
    const hookAddress = (hooks && /^0x[a-fA-F0-9]{40}$/.test(hooks) ? hooks : zeroAddress) as `0x${string}`
    const encoded = encodeAbiParameters(
      [
        { type: 'address', name: 'currency0' },
        { type: 'address', name: 'currency1' },
        { type: 'uint24', name: 'fee' },
        { type: 'int24', name: 'tickSpacing' },
        { type: 'address', name: 'hooks' },
      ],
      [currency0 as `0x${string}`, currency1 as `0x${string}`, fee, tickSpacing, hookAddress]
    )

    return keccak256(encoded)
  }, [version, poolAddress, token0Address, token1Address, fee, tickSpacing, hooks])

  const { data: v4Slot0 } = useReadContract({
    address: V4_STATE_VIEW,
    abi: STATE_VIEW_ABI,
    functionName: 'getSlot0',
    args: poolId ? [poolId] : undefined,
    query: { enabled: version === 'V4' && !!poolId },
  })

  const { data: v4Liquidity } = useReadContract({
    address: V4_STATE_VIEW,
    abi: STATE_VIEW_ABI,
    functionName: 'getLiquidity',
    args: poolId ? [poolId] : undefined,
    query: { enabled: version === 'V4' && !!poolId },
  })

  // Calculate quote based on version
  const swapQuote = useMemo(() => {
    if (amountInWei === 0n) return null

    if (version === 'V2' && v2Reserves && v2Token0 && tokenIn && tokenOut) {
      // V2: constant product formula
      // v2Reserves returns [reserve0, reserve1, blockTimestampLast]
      const reserves = v2Reserves as readonly [bigint, bigint, number]
      const reserve0 = reserves[0]
      const reserve1 = reserves[1]
      const isToken0In = tokenIn.address.toLowerCase() === (v2Token0 as string).toLowerCase()
      const reserveIn = isToken0In ? reserve0 : reserve1
      const reserveOut = isToken0In ? reserve1 : reserve0

      // amountOut = (reserveOut * amountIn * 997) / (reserveIn * 1000 + amountIn * 997)
      const amountInWithFee = amountInWei * 997n
      const numerator = BigInt(reserveOut) * amountInWithFee
      const denominator = BigInt(reserveIn) * 1000n + amountInWithFee
      const amountOut = numerator / denominator

      // Price impact = (amountIn / reserveIn) * 100
      const priceImpact = Number(amountInWei * 100n / BigInt(reserveIn))

      return {
        amountOut: amountOut.toString(),
        priceImpact: Math.min(priceImpact, 100),
        executionPrice: Number(amountOut) / Number(amountInWei),
      }
    }

    if (version === 'V3' && v3Quote) {
      // v3Quote returns [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate]
      const amountOut = (v3Quote as readonly [bigint, bigint, number, bigint])[0]
      // Simplified price impact calculation
      const priceImpact = 0.1 // Would need before/after price comparison
      return {
        amountOut: amountOut.toString(),
        priceImpact,
        executionPrice: Number(amountOut) / Number(amountInWei),
      }
    }

    if (version === 'V4' && v4Slot0 && v4Liquidity && tokenIn && tokenOut) {
      // V4: Use sqrtPriceX96 for quote estimation
      // v4Slot0 returns [sqrtPriceX96, tick, protocolFee, lpFee]
      const slot0 = v4Slot0 as readonly [bigint, number, number, number]
      const sqrtPriceX96 = slot0[0]
      const liquidity = v4Liquidity as bigint

      if (liquidity === 0n) return null

      // Simplified V4 quote using tick math
      // Real implementation would use proper concentrated liquidity math
      const price = Number(sqrtPriceX96) ** 2 / (2 ** 192)
      const isToken0In = tokenIn.address.toLowerCase() < tokenOut.address.toLowerCase()
      const effectivePrice = isToken0In ? price : 1 / price

      const amountOutEstimate = Number(amountInWei) * effectivePrice * 0.997 // 0.3% fee
      const priceImpact = (Number(amountInWei) / Number(liquidity)) * 100

      return {
        amountOut: BigInt(Math.floor(amountOutEstimate)).toString(),
        priceImpact: Math.min(priceImpact, 100),
        executionPrice: effectivePrice,
      }
    }

    return null
  }, [version, amountInWei, v2Reserves, v2Token0, v3Quote, v4Slot0, v4Liquidity, tokenIn, tokenOut])

  const quoteLoading = version === 'V3' && v3Loading

  // Fetch token info on mount
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

      // Apply 0.5% slippage to the quote
      const minAmountOut = (BigInt(swapQuote.amountOut) * 995n / 1000n).toString()

      const res = await fetch(`${API_BASE}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress,
          version,
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn: amountInWei.toString(),
          minAmountOut,
          recipient: wallet,
          fee,
          tickSpacing,
          ...(hooks && { hooks }),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to build swap transaction')
      }

      const { transaction } = await res.json()

      setSwapStatus('pending')
      await sendTransaction(transaction)
      setSwapStatus('success')

      setTimeout(() => {
        setSwapStatus('idle')
        setSwapAmount('')
      }, 3000)
    } catch (err: any) {
      console.error('[executeSwap] Error:', err)
      setError(err.message || 'Swap failed')
      setSwapStatus('error')
    }
  }

  const formatAmount = (amount: number | undefined, decimals: number = 6) => {
    if (amount === undefined || amount === null) return '0'
    if (amount < 0.000001) return '<0.000001'
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`
    return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href="/" label="Back to Pools" />

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
            <button onClick={() => router.push('/')}>Back to Pools</button>
          </div>
        ) : (
          <div className="trade-card">
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
              <span className="input-label">Amount ({tokenIn?.symbol})</span>
              <input
                type="number"
                className="amount-input"
                placeholder="0.0"
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                disabled={swapStatus === 'pending'}
              />
            </div>

            {/* Real-time Quote Display */}
            {quoteLoading && (
              <div className="quote-loading">
                <span className="loading-spinner small" /> Getting quote...
              </div>
            )}

            {swapQuote && amountInWei > 0n && (
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
                  <span className="quote-label">Min. Received (0.5% slippage)</span>
                  <span className="quote-value">
                    {formatAmount(Number(swapQuote.amountOut) * 0.995 / Math.pow(10, decimalsOut))} {tokenOut?.symbol}
                  </span>
                </div>
                {swapQuote.priceImpact > 5 && (
                  <div className="price-impact-warning">
                    High price impact! Consider using a smaller amount.
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="tx-error">{error}</div>
            )}

            {v3Error && (
              <div className="tx-error">Quote error: {v3Error.message}</div>
            )}

            {/* Execute Swap Button */}
            <button
              className="btn btn-primary full-width"
              onClick={handleExecuteSwap}
              disabled={!swapQuote || swapStatus === 'pending' || swapStatus === 'building'}
            >
              {swapStatus === 'building' && 'Building...'}
              {swapStatus === 'pending' && (
                <>
                  <span className="loading-spinner small" /> Swapping...
                </>
              )}
              {swapStatus === 'success' && (isSafe ? 'Proposed to Safe' : 'Success!')}
              {swapStatus === 'error' && 'Failed - Try Again'}
              {swapStatus === 'idle' && (swapQuote ? 'Execute Swap' : 'Enter amount')}
            </button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}
