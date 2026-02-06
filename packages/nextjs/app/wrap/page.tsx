'use client'

import { useState, useEffect } from 'react'
import { useWallet, useIsFarcaster, useIsSafe } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { ROUTES, WETH_ADDRESS } from '@/utils/constants'
// SDK imported dynamically to avoid module-level crashes on mobile
import { useSendTransaction } from 'wagmi'
import { parseEther, formatEther } from 'viem'

const API_BASE = '/api'

// WETH ABI - just the functions we need
const WETH_DEPOSIT_SELECTOR = '0xd0e30db0' // deposit()
const WETH_WITHDRAW_SELECTOR = '0x2e1a7d4d' // withdraw(uint256)

export default function WrapPage() {
  const wallet = useWallet()
  const isFarcaster = useIsFarcaster()
  const isSafe = useIsSafe()
  const { sendTransactionAsync } = useSendTransaction()

  const [ethBalance, setEthBalance] = useState<string>('0')
  const [wethBalance, setWethBalance] = useState<string>('0')
  const [amount, setAmount] = useState<string>('')
  const [isWrapping, setIsWrapping] = useState(true) // true = wrap, false = unwrap
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch balances
  useEffect(() => {
    async function fetchBalances() {
      if (!wallet) {
        setLoading(false)
        return
      }

      try {
        // Fetch ETH balance
        const ethRes = await fetch(`${API_BASE}/eth-balance?address=${wallet}`)
        if (ethRes.ok) {
          const ethData = await ethRes.json()
          setEthBalance(ethData.balanceFormatted || '0')
        }

        // Fetch WETH balance
        const wethRes = await fetch(`${API_BASE}/token-balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenAddress: WETH_ADDRESS, walletAddress: wallet }),
        })
        if (wethRes.ok) {
          const wethData = await wethRes.json()
          setWethBalance(wethData.balanceFormatted || '0')
        }
      } catch (err) {
        console.error('Failed to fetch balances:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchBalances()
  }, [wallet, status]) // Refetch after successful tx

  const sendTransaction = async (tx: { to: string; data: string; value: string }) => {
    if (!wallet) throw new Error('No wallet connected')

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
          value: tx.value !== '0' ? `0x${BigInt(tx.value).toString(16)}` : '0x0',
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
  }

  const handleWrap = async () => {
    if (!wallet || !amount || parseFloat(amount) <= 0) return

    setStatus('pending')
    setError(null)

    try {
      const amountWei = parseEther(amount)

      // deposit() - no params, just send ETH value
      await sendTransaction({
        to: WETH_ADDRESS,
        data: WETH_DEPOSIT_SELECTOR,
        value: amountWei.toString(),
      })

      setStatus('success')
      setAmount('')
    } catch (err: any) {
      console.error('Wrap failed:', err)
      setError(err.message || 'Wrap failed')
      setStatus('error')
    }
  }

  const handleUnwrap = async () => {
    if (!wallet || !amount || parseFloat(amount) <= 0) return

    setStatus('pending')
    setError(null)

    try {
      const amountWei = parseEther(amount)

      // withdraw(uint256) - encode the amount parameter
      const amountHex = amountWei.toString(16).padStart(64, '0')
      const data = WETH_WITHDRAW_SELECTOR + amountHex

      await sendTransaction({
        to: WETH_ADDRESS,
        data,
        value: '0',
      })

      setStatus('success')
      setAmount('')
    } catch (err: any) {
      console.error('Unwrap failed:', err)
      setError(err.message || 'Unwrap failed')
      setStatus('error')
    }
  }

  const handleMaxClick = () => {
    if (isWrapping) {
      // Leave a small amount for gas
      const maxEth = Math.max(0, parseFloat(ethBalance) - 0.001)
      setAmount(maxEth > 0 ? maxEth.toFixed(6) : '0')
    } else {
      setAmount(wethBalance)
    }
  }

  const currentBalance = isWrapping ? ethBalance : wethBalance
  const canSubmit = wallet && amount && parseFloat(amount) > 0 && parseFloat(amount) <= parseFloat(currentBalance)

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back to Home" />

        <div className="section-header">
          <h2>Wrap / Unwrap ETH</h2>
          <p className="section-subtitle">Convert between ETH and WETH for liquidity pools</p>
        </div>

        {!wallet ? (
          <div className="empty-state">
            <p>Connect your wallet to wrap/unwrap ETH</p>
          </div>
        ) : (
          <div className="create-pool-card">
            {/* Balance Display */}
            <div className="create-section">
              <div className="balance-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <div className="balance-label" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>ETH Balance</div>
                  <div className="balance-value" style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                    {loading ? '...' : parseFloat(ethBalance).toFixed(6)} ETH
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="balance-label" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>WETH Balance</div>
                  <div className="balance-value" style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                    {loading ? '...' : parseFloat(wethBalance).toFixed(6)} WETH
                  </div>
                </div>
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="create-section">
              <div className="version-selector" style={{ marginBottom: '1rem' }}>
                <button
                  className={`version-btn ${isWrapping ? 'selected' : ''}`}
                  onClick={() => { setIsWrapping(true); setAmount(''); setError(null); setStatus('idle'); }}
                >
                  <span>Wrap</span>
                  <span className="version-desc">ETH → WETH</span>
                </button>
                <button
                  className={`version-btn ${!isWrapping ? 'selected' : ''}`}
                  onClick={() => { setIsWrapping(false); setAmount(''); setError(null); setStatus('idle'); }}
                >
                  <span>Unwrap</span>
                  <span className="version-desc">WETH → ETH</span>
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="create-section">
              <div className="input-group">
                <label className="input-label">
                  <span>Amount ({isWrapping ? 'ETH' : 'WETH'})</span>
                  <button
                    type="button"
                    className="max-btn"
                    onClick={handleMaxClick}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      marginLeft: '0.5rem',
                    }}
                  >
                    Max
                  </button>
                </label>
                <div className="input-wrapper">
                  <input
                    type="number"
                    className="amount-input"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setError(null); setStatus('idle'); }}
                    step="any"
                    min="0"
                  />
                  <span className="input-suffix" style={{ color: 'var(--text-muted)' }}>
                    {isWrapping ? 'ETH' : 'WETH'}
                  </span>
                </div>
                <div className="input-hint" style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                  Available: {parseFloat(currentBalance).toFixed(6)} {isWrapping ? 'ETH' : 'WETH'}
                </div>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="tx-error" style={{ marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            {/* Success Display */}
            {status === 'success' && (
              <div className="fee-warning" style={{
                background: 'rgba(34, 197, 94, 0.1)',
                borderColor: 'var(--positive)',
                color: 'var(--positive)',
                marginBottom: '1rem',
              }}>
                {isSafe
                  ? (isWrapping ? 'Wrap proposed to Safe' : 'Unwrap proposed to Safe')
                  : (isWrapping ? 'ETH wrapped to WETH successfully!' : 'WETH unwrapped to ETH successfully!')}
              </div>
            )}

            {/* Submit Button */}
            <button
              className="btn-next"
              onClick={isWrapping ? handleWrap : handleUnwrap}
              disabled={!canSubmit || status === 'pending'}
              style={{ width: '100%' }}
            >
              {status === 'pending' ? (
                <>
                  <span className="loading-spinner small" style={{ marginRight: '0.5rem' }} />
                  {isWrapping ? 'Wrapping...' : 'Unwrapping...'}
                </>
              ) : isWrapping ? (
                'Wrap ETH to WETH'
              ) : (
                'Unwrap WETH to ETH'
              )}
            </button>

            {/* Info */}
            <div className="fee-warning" style={{
              background: 'rgba(100, 100, 100, 0.1)',
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
              marginTop: '1rem',
            }}>
              WETH (Wrapped ETH) is required for adding liquidity to ETH pairs on Uniswap V3/V4.
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}
