'use client'

import { useEffect, useState } from 'react'
import { useAppState } from '@/store/AppContext'
import { getWalletAddress } from '@/lib/wallet'
import { ARBME_ADDRESS } from '@/utils/constants'
import { AppHeader } from '@/components/AppHeader'
import Link from 'next/link'

interface Token {
  address: string
  symbol: string
  decimals: number
  priceUsd?: number
}

// Common tokens on Base
const COMMON_TOKENS = [
  { address: ARBME_ADDRESS, symbol: 'ARBME', decimals: 18 },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
  { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6 },
  { address: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb', symbol: 'CLANKER', decimals: 18 },
  { address: '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42', symbol: 'PAGE', decimals: 18 },
  { address: '0x4ed4e862860bed51a9570b96d89af5e1b0efefed', symbol: 'DEGEN', decimals: 18 },
]

// Fee tiers with descriptions
const FEE_TIERS = [
  { value: 100, label: '0.01%', desc: 'Stablecoins' },
  { value: 500, label: '0.05%', desc: 'Correlated' },
  { value: 3000, label: '0.30%', desc: 'Standard' },
  { value: 10000, label: '1.00%', desc: 'Exotic' },
]

export default function CreatePoolPage() {
  const { state, setState } = useAppState()
  const { wallet, error } = state

  const [tokenA, setTokenA] = useState<Token | null>(null)
  const [tokenB, setTokenB] = useState<Token>({
    address: ARBME_ADDRESS,
    symbol: 'ARBME',
    decimals: 18,
  })
  const [version, setVersion] = useState<'v2' | 'v3' | 'v4'>('v4')
  const [feeTier, setFeeTier] = useState(3000)
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [showCustomA, setShowCustomA] = useState(false)
  const [showCustomB, setShowCustomB] = useState(false)
  const [customAddressA, setCustomAddressA] = useState('')
  const [customAddressB, setCustomAddressB] = useState('')

  useEffect(() => {
    loadWallet()
  }, [])

  async function loadWallet() {
    if (!wallet) {
      const address = await getWalletAddress()
      if (address) {
        setState({ wallet: address })
      }
    }
  }

  function handleTokenASelect(value: string) {
    if (value === 'custom') {
      setShowCustomA(true)
      setTokenA(null)
    } else if (value === '') {
      setShowCustomA(false)
      setTokenA(null)
    } else {
      const token = COMMON_TOKENS.find(t => t.address === value)
      if (token) {
        setShowCustomA(false)
        setTokenA({ ...token })
      }
    }
  }

  function handleTokenBSelect(value: string) {
    if (value === 'custom') {
      setShowCustomB(true)
      setTokenB({ address: '', symbol: '', decimals: 18 })
    } else if (value === '') {
      setShowCustomB(false)
      setTokenB({ address: '', symbol: '', decimals: 18 })
    } else {
      const token = COMMON_TOKENS.find(t => t.address === value)
      if (token) {
        setShowCustomB(false)
        setTokenB({ ...token })
      }
    }
  }

  function handleCustomAddressA() {
    const address = customAddressA.trim()
    if (address && address.startsWith('0x')) {
      setTokenA({
        address,
        symbol: 'CUSTOM',
        decimals: 18,
      })
    }
  }

  function handleCustomAddressB() {
    const address = customAddressB.trim()
    if (address && address.startsWith('0x')) {
      setTokenB({
        address,
        symbol: 'CUSTOM',
        decimals: 18,
      })
    }
  }

  async function handleCreatePool() {
    if (!wallet || !tokenA || !tokenB) {
      setState({ error: 'Missing required information' })
      return
    }

    setIsCreating(true)
    setState({ error: null })

    try {
      console.log('[CreatePool] Creating pool:', {
        tokenA,
        tokenB,
        version,
        feeTier,
        amountA,
        amountB,
      })

      // Pool creation not yet implemented
      setState({ error: 'Pool creation not yet implemented' })
    } catch (err) {
      console.error('[CreatePool] Failed to create pool:', err)
      setState({ error: 'Failed to create pool. Please try again.' })
    } finally {
      setIsCreating(false)
    }
  }

  const canCreate = tokenA && tokenB &&
                    amountA && amountB &&
                    parseFloat(amountA) > 0 &&
                    parseFloat(amountB) > 0

  const initialPrice = amountA && amountB && parseFloat(amountA) > 0
    ? (parseFloat(amountB) / parseFloat(amountA)).toFixed(6)
    : null

  if (!wallet) {
    return (
      <div className="create-pool-page">
        <AppHeader />
        <div className="page-subheader">
          <Link href="/app" className="back-button">← Back</Link>
          <h2>Create New Pool</h2>
        </div>
        <div className="empty-state">
          <p className="text-secondary">Wallet not connected</p>
          <p className="text-muted">Connect your Farcaster wallet to create pools</p>
        </div>
      </div>
    )
  }

  return (
    <div className="create-pool-page">
      <AppHeader />

      <div className="page-subheader">
        <Link href="/app" className="back-button">← Back</Link>
        <h2>Create New Pool</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="create-pool-card">
        <div className="create-section">
          <h3 className="section-title">Select Tokens</h3>

          {/* Token A */}
          <div className="token-selector-group">
            <div className="token-selector-label">Token A</div>
            <select
              className="token-select"
              onChange={(e) => handleTokenASelect(e.target.value)}
              value={tokenA?.address || ''}
            >
              <option value="">Select token...</option>
              {COMMON_TOKENS.map(t => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
              <option value="custom">Custom Address...</option>
            </select>

            {showCustomA && (
              <input
                type="text"
                className="token-custom-input"
                placeholder="0x..."
                value={customAddressA}
                onChange={(e) => setCustomAddressA(e.target.value)}
                onBlur={handleCustomAddressA}
              />
            )}

            {tokenA && (
              <div className="token-selected-info">
                <span className="token-symbol">{tokenA.symbol}</span>
                <span className="token-address">
                  {tokenA.address.slice(0, 6)}...{tokenA.address.slice(-4)}
                </span>
              </div>
            )}
          </div>

          {/* Token B */}
          <div className="token-selector-group">
            <div className="token-selector-label">Token B</div>
            <select
              className="token-select"
              onChange={(e) => handleTokenBSelect(e.target.value)}
              value={tokenB?.address || ''}
            >
              <option value="">Select token...</option>
              {COMMON_TOKENS.map(t => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
              <option value="custom">Custom Address...</option>
            </select>

            {showCustomB && (
              <input
                type="text"
                className="token-custom-input"
                placeholder="0x..."
                value={customAddressB}
                onChange={(e) => setCustomAddressB(e.target.value)}
                onBlur={handleCustomAddressB}
              />
            )}

            {tokenB && (
              <div className="token-selected-info">
                <span className="token-symbol">{tokenB.symbol}</span>
                <span className="token-address">
                  {tokenB.address.slice(0, 6)}...{tokenB.address.slice(-4)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="create-section">
          <div className="selector-group">
            <div className="selector-label">Pool Version</div>
            <div className="version-selector">
              <button
                className={`version-btn ${version === 'v2' ? 'selected' : ''}`}
                onClick={() => setVersion('v2')}
              >
                <span className="version-badge v2">V2</span>
                <span className="version-desc">Simple AMM</span>
              </button>
              <button
                className={`version-btn ${version === 'v3' ? 'selected' : ''}`}
                onClick={() => setVersion('v3')}
              >
                <span className="version-badge v3">V3</span>
                <span className="version-desc">Concentrated</span>
              </button>
              <button
                className={`version-btn ${version === 'v4' ? 'selected' : ''}`}
                onClick={() => setVersion('v4')}
              >
                <span className="version-badge v4">V4</span>
                <span className="version-desc">Hooks</span>
              </button>
            </div>
          </div>
        </div>

        {version !== 'v2' && (
          <div className="create-section">
            <div className="selector-group">
              <div className="selector-label">Fee Tier</div>
              <div className="fee-tier-selector">
                {FEE_TIERS.map(tier => (
                  <button
                    key={tier.value}
                    className={`fee-tier-btn ${feeTier === tier.value ? 'selected' : ''}`}
                    onClick={() => setFeeTier(tier.value)}
                  >
                    <span className="fee-label">{tier.label}</span>
                    <span className="fee-desc">{tier.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="create-section">
          <h3 className="section-title">Initial Liquidity</h3>

          {!tokenA || !tokenB ? (
            <div className="info-message">Select both tokens to continue</div>
          ) : (
            <div className="amount-inputs">
              <div className="input-group">
                <div className="input-label">
                  <span>{tokenA.symbol} Amount</span>
                  <span className="input-balance">Balance: --</span>
                </div>
                <div className="input-wrapper">
                  <input
                    type="number"
                    className="amount-input"
                    placeholder="0.0"
                    step="any"
                    value={amountA}
                    onChange={(e) => setAmountA(e.target.value)}
                  />
                  <span className="input-token-label">{tokenA.symbol}</span>
                </div>
              </div>

              <div className="input-group">
                <div className="input-label">
                  <span>{tokenB.symbol} Amount</span>
                  <span className="input-balance">Balance: --</span>
                </div>
                <div className="input-wrapper">
                  <input
                    type="number"
                    className="amount-input"
                    placeholder="0.0"
                    step="any"
                    value={amountB}
                    onChange={(e) => setAmountB(e.target.value)}
                  />
                  <span className="input-token-label">{tokenB.symbol}</span>
                </div>
              </div>

              {initialPrice && (
                <div className="initial-price-display">
                  <span className="price-label">Initial Price:</span>
                  <span className="price-value">
                    1 {tokenA.symbol} = {initialPrice} {tokenB.symbol}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="create-actions">
          <button
            className="button-primary"
            onClick={handleCreatePool}
            disabled={!canCreate || isCreating}
          >
            {isCreating ? 'Creating Pool...' : 'Create Pool & Add Liquidity'}
          </button>
        </div>

        <div className="create-info">
          <p className="text-secondary">
            Creating a new pool will initialize it with your chosen ratio and add your initial liquidity.
          </p>
        </div>
      </div>
    </div>
  )
}
