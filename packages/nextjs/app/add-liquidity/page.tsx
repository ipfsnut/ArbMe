'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useWallet } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { TokenInput } from '@/components/TokenInput'
import { FeeTierSelector } from '@/components/FeeTierSelector'
import { TransactionButton } from '@/components/TransactionButton'
import { ROUTES, ARBME_ADDRESS, WETH_ADDRESS } from '@/utils/constants'
import sdk from '@farcaster/miniapp-sdk'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/app/api'

type Version = 'V2' | 'V3' | 'V4'
type TxStatus = 'idle' | 'checking' | 'approving' | 'creating' | 'success' | 'error'

interface TokenInfo {
  address: string
  symbol: string
  decimals: number
  balance?: string
}

const COMMON_TOKENS = [
  { address: ARBME_ADDRESS, symbol: 'ARBME' },
  { address: WETH_ADDRESS, symbol: 'WETH' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' },
]

export default function AddLiquidityPage() {
  const wallet = useWallet()

  // Form state
  const [version, setVersion] = useState<Version>('V3')
  const [token0Address, setToken0Address] = useState(ARBME_ADDRESS)
  const [token1Address, setToken1Address] = useState(WETH_ADDRESS)
  const [token0, setToken0] = useState<TokenInfo | null>(null)
  const [token1, setToken1] = useState<TokenInfo | null>(null)
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [fee, setFee] = useState(3000) // 0.3% default

  // Pool status
  const [poolExists, setPoolExists] = useState<boolean | null>(null)
  const [checkingPool, setCheckingPool] = useState(false)

  // Transaction state
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txError, setTxError] = useState<string | null>(null)

  // Fetch token info on address change
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

    fetchTokenInfo(token0Address, setToken0)
    fetchTokenInfo(token1Address, setToken1)
  }, [token0Address, token1Address])

  // Check pool exists when tokens/version/fee change
  useEffect(() => {
    async function checkPool() {
      if (!token0 || !token1) {
        setPoolExists(null)
        return
      }

      setCheckingPool(true)
      try {
        const res = await fetch(`${API_BASE}/check-pool-exists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: version.toLowerCase(),
            token0: token0.address,
            token1: token1.address,
            fee: version !== 'V2' ? fee : undefined,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          setPoolExists(data.exists)
        }
      } catch (err) {
        console.error('Failed to check pool:', err)
      } finally {
        setCheckingPool(false)
      }
    }

    checkPool()
  }, [token0, token1, version, fee])

  // Fetch balances when wallet connects
  useEffect(() => {
    async function fetchBalances() {
      if (!wallet || !token0 || !token1) return

      try {
        const [bal0, bal1] = await Promise.all([
          fetch(`${API_BASE}/token-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenAddress: token0.address, walletAddress: wallet }),
          }).then(r => r.json()),
          fetch(`${API_BASE}/token-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenAddress: token1.address, walletAddress: wallet }),
          }).then(r => r.json()),
        ])

        setToken0(prev => prev ? { ...prev, balance: bal0.balanceFormatted } : null)
        setToken1(prev => prev ? { ...prev, balance: bal1.balanceFormatted } : null)
      } catch (err) {
        console.error('Failed to fetch balances:', err)
      }
    }

    fetchBalances()
  }, [wallet, token0?.address, token1?.address])

  const sendTransaction = async (tx: { to: string; data: string; value: string }) => {
    if (!wallet) throw new Error('No wallet connected')

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
  }

  const handleSubmit = async () => {
    if (!wallet || !token0 || !token1 || !amount0 || !amount1) return

    try {
      setTxStatus('checking')
      setTxError(null)

      // TODO: Check and handle approvals
      // For now, go straight to creating

      setTxStatus('creating')

      const res = await fetch(`${API_BASE}/build-create-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: version.toLowerCase(),
          token0: token0.address,
          token1: token1.address,
          amount0,
          amount1,
          fee: version !== 'V2' ? fee : undefined,
          price: parseFloat(amount1) / parseFloat(amount0),
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

      setTxStatus('success')
    } catch (err: any) {
      console.error('[addLiquidity] Error:', err)
      setTxError(err.message || 'Transaction failed')
      setTxStatus('error')
    }
  }

  const isValid = wallet && token0 && token1 && amount0 && amount1 && parseFloat(amount0) > 0 && parseFloat(amount1) > 0

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
          <div className="create-pool-card">
            {/* Version Selector */}
            <div className="create-section">
              <h3 className="section-title">Protocol Version</h3>
              <div className="version-selector">
                {(['V2', 'V3', 'V4'] as Version[]).map((v) => (
                  <button
                    key={v}
                    className={`version-btn ${version === v ? 'selected' : ''}`}
                    onClick={() => setVersion(v)}
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
                  value={token0Address}
                  onChange={(e) => setToken0Address(e.target.value)}
                >
                  {COMMON_TOKENS.map((t) => (
                    <option key={t.address} value={t.address}>{t.symbol}</option>
                  ))}
                  <option value="">Custom...</option>
                </select>
                {token0Address === '' && (
                  <input
                    type="text"
                    className="token-custom-input"
                    placeholder="Enter token address"
                    onChange={(e) => setToken0Address(e.target.value)}
                  />
                )}
                {token0 && (
                  <div className="token-selected-info">
                    <span className="token-symbol">{token0.symbol}</span>
                    {token0.balance && <span className="token-address">Balance: {parseFloat(token0.balance).toFixed(4)}</span>}
                  </div>
                )}
              </div>

              <div className="token-selector-group">
                <label className="token-selector-label">Token 2</label>
                <select
                  className="token-select"
                  value={token1Address}
                  onChange={(e) => setToken1Address(e.target.value)}
                >
                  {COMMON_TOKENS.map((t) => (
                    <option key={t.address} value={t.address}>{t.symbol}</option>
                  ))}
                  <option value="">Custom...</option>
                </select>
                {token1Address === '' && (
                  <input
                    type="text"
                    className="token-custom-input"
                    placeholder="Enter token address"
                    onChange={(e) => setToken1Address(e.target.value)}
                  />
                )}
                {token1 && (
                  <div className="token-selected-info">
                    <span className="token-symbol">{token1.symbol}</span>
                    {token1.balance && <span className="token-address">Balance: {parseFloat(token1.balance).toFixed(4)}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Fee Tier (V3/V4 only) */}
            {version !== 'V2' && (
              <div className="create-section">
                <h3 className="section-title">Fee Tier</h3>
                <FeeTierSelector value={fee} onChange={setFee} />
              </div>
            )}

            {/* Pool Status */}
            {token0 && token1 && (
              <div className="create-section">
                <div className={`fee-warning`} style={{
                  background: poolExists ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 193, 7, 0.1)',
                  borderColor: poolExists ? 'var(--positive)' : 'rgba(255, 193, 7, 0.3)',
                  color: poolExists ? 'var(--positive)' : '#ffb84d',
                }}>
                  {checkingPool ? (
                    'Checking pool status...'
                  ) : poolExists ? (
                    'Pool exists - adding to existing liquidity'
                  ) : (
                    'New pool - you will set the initial price'
                  )}
                </div>
              </div>
            )}

            {/* Amounts */}
            <div className="create-section">
              <h3 className="section-title">Deposit Amounts</h3>
              <div className="amount-inputs">
                <TokenInput
                  label={token0?.symbol || 'Token 1'}
                  symbol={token0?.symbol}
                  balance={token0?.balance}
                  value={amount0}
                  onChange={setAmount0}
                />

                <TokenInput
                  label={token1?.symbol || 'Token 2'}
                  symbol={token1?.symbol}
                  balance={token1?.balance}
                  value={amount1}
                  onChange={setAmount1}
                />

                {amount0 && amount1 && parseFloat(amount0) > 0 && (
                  <div className="initial-price-display">
                    <span className="price-label">Initial Price</span>
                    <span className="price-value">
                      1 {token0?.symbol} = {(parseFloat(amount1) / parseFloat(amount0)).toFixed(6)} {token1?.symbol}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="create-actions">
              {txError && (
                <div className="tx-error" style={{ marginBottom: '1rem' }}>{txError}</div>
              )}

              <button
                className="button-primary"
                onClick={handleSubmit}
                disabled={!isValid || txStatus === 'checking' || txStatus === 'approving' || txStatus === 'creating'}
              >
                {txStatus === 'checking' && 'Checking approvals...'}
                {txStatus === 'approving' && 'Approving tokens...'}
                {txStatus === 'creating' && 'Creating position...'}
                {txStatus === 'success' && 'Success!'}
                {txStatus === 'error' && 'Try Again'}
                {txStatus === 'idle' && (poolExists ? 'Add Liquidity' : 'Create Pool')}
              </button>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}
