'use client'

import { useEffect, useState } from 'react'
import { useAppState } from '@/store/AppContext'
import { getWalletAddress } from '@/lib/wallet'
import { ARBME_ADDRESS } from '@/utils/constants'
import { AppHeader } from '@/components/AppHeader'
import Link from 'next/link'
import {
  fetchTokenInfo,
  checkPoolExists,
  checkApprovals,
  buildApprovalTransaction,
  buildCreatePoolTransaction,
  fetchTokenBalance,
  fetchPoolPrice,
  calculateLiquidityRatio,
} from '@/services/api'
import sdk from '@farcaster/miniapp-sdk'
import { QuickSelectButtons } from '@/components/QuickSelectButtons'
import { SlippageControl } from '@/components/SlippageControl'
import { Footer } from '@/components/Footer'
import { TransactionConfirmModal } from '@/components/TransactionConfirmModal'
import { ethers } from 'ethers'

interface Token {
  address: string
  symbol: string
  decimals: number
  priceUsd?: number
}

// USDC address for blocking from Uniswap
const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

// Common tokens on Base (USDC not supported)
const COMMON_TOKENS = [
  { address: ARBME_ADDRESS, symbol: 'ARBME', decimals: 18 },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
  { address: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb', symbol: 'CLANKER', decimals: 18 },
  { address: '0x59e058780dd8a6017061596a62288b6438edbe68', symbol: 'OINC', decimals: 18 },
  { address: '0x2b5050f01d64fbb3e4ac44dc07f0732bfb5ecadf', symbol: 'QR', decimals: 18 },
  { address: '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42', symbol: 'PAGE', decimals: 18 },
  { address: '0x4ed4e862860bed51a9570b96d89af5e1b0efefed', symbol: 'DEGEN', decimals: 18 },
]

// Fee tiers with descriptions
const FEE_TIERS = [
  { value: 100, label: '0.01%', desc: 'Stablecoins', warning: null },
  { value: 500, label: '0.05%', desc: 'Correlated', warning: null },
  { value: 3000, label: '0.30%', desc: 'Standard', warning: null },
  { value: 10000, label: '1.00%', desc: 'Exotic', warning: null },
  { value: 30000, label: '3.00%', desc: 'High Fee', warning: 'Higher fees may reduce trading volume' },
  { value: 50000, label: '5.00%', desc: 'Very High', warning: 'Significantly reduced volume expected' },
  { value: 100000, label: '10.00%', desc: 'Premium', warning: 'Volume will be very low' },
  { value: 150000, label: '15.00%', desc: 'Ultra Premium', warning: 'Minimal volume expected' },
  { value: 200000, label: '20.00%', desc: 'Extreme', warning: 'Almost no volume expected' },
  { value: 250000, label: '25.00%', desc: 'Maximum', warning: 'Virtually no trading volume' },
  { value: 500000, label: '50.00%', desc: 'Prohibitive', warning: 'No realistic trading expected' },
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
  const [poolExists, setPoolExists] = useState(false)
  const [currentStep, setCurrentStep] = useState<string>('')
  const [poolAddress, setPoolAddress] = useState<string>('')
  const [balanceA, setBalanceA] = useState<string>('')
  const [balanceB, setBalanceB] = useState<string>('')
  const [loadingBalanceA, setLoadingBalanceA] = useState(false)
  const [loadingBalanceB, setLoadingBalanceB] = useState(false)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [priceDisplay, setPriceDisplay] = useState<string>('')
  const [slippageTolerance, setSlippageTolerance] = useState(0.5)
  const [autoCalculating, setAutoCalculating] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [customPriceA, setCustomPriceA] = useState('')
  const [customPriceB, setCustomPriceB] = useState('')

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
      if (address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
        setState({ error: 'USDC pairs are not supported. Please use a different token.' })
        return
      }
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
      if (address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
        setState({ error: 'USDC pairs are not supported. Please use a different token.' })
        return
      }
      setTokenB({
        address,
        symbol: 'CUSTOM',
        decimals: 18,
      })
    }
  }

  // Fetch token decimals for custom token A
  useEffect(() => {
    if (tokenA && tokenA.symbol === 'CUSTOM') {
      fetchTokenInfo(tokenA.address)
        .then(info => {
          setTokenA({ ...tokenA, symbol: info.symbol, decimals: info.decimals })
        })
        .catch(err => {
          console.error('[CreatePool] Failed to fetch token A info:', err)
          setState({ error: 'Failed to fetch token info. Please check the address.' })
        })
    }
  }, [tokenA?.address])

  // Fetch token decimals for custom token B
  useEffect(() => {
    if (tokenB && tokenB.symbol === 'CUSTOM') {
      fetchTokenInfo(tokenB.address)
        .then(info => {
          setTokenB({ ...tokenB, symbol: info.symbol, decimals: info.decimals })
        })
        .catch(err => {
          console.error('[CreatePool] Failed to fetch token B info:', err)
          setState({ error: 'Failed to fetch token info. Please check the address.' })
        })
    }
  }, [tokenB?.address])

  // Fetch balance for token A
  useEffect(() => {
    if (!wallet || !tokenA?.address) {
      setBalanceA('')
      return
    }

    setLoadingBalanceA(true)
    fetchTokenBalance(tokenA.address, wallet)
      .then(({ balanceFormatted }) => {
        setBalanceA(balanceFormatted)
      })
      .catch(err => {
        console.error('[CreatePool] Failed to fetch balance A:', err)
      })
      .finally(() => {
        setLoadingBalanceA(false)
      })
  }, [wallet, tokenA?.address, version])

  // Fetch balance for token B
  useEffect(() => {
    if (!wallet || !tokenB?.address) {
      setBalanceB('')
      return
    }

    setLoadingBalanceB(true)
    fetchTokenBalance(tokenB.address, wallet)
      .then(({ balanceFormatted }) => {
        setBalanceB(balanceFormatted)
      })
      .catch(err => {
        console.error('[CreatePool] Failed to fetch balance B:', err)
      })
      .finally(() => {
        setLoadingBalanceB(false)
      })
  }, [wallet, tokenB?.address, version])

  // Fetch pool price when tokens or fee tier changes
  useEffect(() => {
    if (!tokenA?.address || !tokenB?.address) {
      setCurrentPrice(null)
      setPriceDisplay('')
      return
    }

    fetchPoolPrice({
      version,
      token0: tokenA.address,
      token1: tokenB.address,
      fee: version !== 'v2' ? feeTier : undefined,
    })
      .then(({ exists, price, priceDisplay }) => {
        if (exists && price) {
          setCurrentPrice(price)
          setPriceDisplay(priceDisplay || '')
        } else {
          setCurrentPrice(null)
          setPriceDisplay('')
        }
      })
      .catch(err => {
        console.error('[CreatePool] Failed to fetch pool price:', err)
      })
  }, [tokenA?.address, tokenB?.address, version, feeTier])

  // Auto-calculate amount B when amount A changes
  useEffect(() => {
    if (!amountA || !tokenA || !tokenB || parseFloat(amountA) === 0 || autoCalculating) {
      return
    }

    // If pool doesn't exist yet, user sets both amounts manually
    if (!currentPrice) {
      return
    }

    setAutoCalculating(true)
    calculateLiquidityRatio({
      version,
      token0: tokenA.address,
      token1: tokenB.address,
      fee: version !== 'v2' ? feeTier : undefined,
      amount0: amountA,
      decimals0: tokenA.decimals,
      decimals1: tokenB.decimals,
    })
      .then(({ amount1 }) => {
        setAmountB(amount1)
      })
      .catch(err => {
        console.error('[CreatePool] Failed to calculate amount B:', err)
      })
      .finally(() => {
        setAutoCalculating(false)
      })
  }, [amountA, tokenA, tokenB, version, feeTier, currentPrice])

  // Auto-calculate amount A when amount B changes
  useEffect(() => {
    if (!amountB || !tokenA || !tokenB || parseFloat(amountB) === 0 || autoCalculating) {
      return
    }

    if (!currentPrice) {
      return
    }

    setAutoCalculating(true)
    calculateLiquidityRatio({
      version,
      token0: tokenA.address,
      token1: tokenB.address,
      fee: version !== 'v2' ? feeTier : undefined,
      amount1: amountB,
      decimals0: tokenA.decimals,
      decimals1: tokenB.decimals,
    })
      .then(({ amount0 }) => {
        setAmountA(amount0)
      })
      .catch(err => {
        console.error('[CreatePool] Failed to calculate amount A:', err)
      })
      .finally(() => {
        setAutoCalculating(false)
      })
  }, [amountB, tokenA, tokenB, version, feeTier, currentPrice])

  // Check pool existence
  useEffect(() => {
    if (tokenA && tokenB && tokenA.address && tokenB.address) {
      checkPoolExists({
        version,
        token0: tokenA.address,
        token1: tokenB.address,
        fee: version !== 'v2' ? feeTier : undefined,
      })
        .then(result => {
          setPoolExists(result.exists)
          setPoolAddress(result.poolAddress || '')
          if (result.exists) {
            setState({
              error: `Pool already exists at ${result.poolAddress}. You can add liquidity to it instead.`,
            })
          } else {
            setState({ error: null })
          }
        })
        .catch(err => {
          console.error('[CreatePool] Failed to check pool exists:', err)
        })
    }
  }, [tokenA?.address, tokenB?.address, version, feeTier])

  function handleInitiatePoolCreation() {
    if (!tokenA || !tokenB || !amountA || !amountB) {
      setState({ error: 'Missing required information' })
      return
    }
    setShowConfirmModal(true)
  }

  async function handleCreatePool() {
    if (!wallet || !tokenA || !tokenB || !amountA || !amountB) {
      setState({ error: 'Missing required information' })
      return
    }

    setShowConfirmModal(false)
    setIsCreating(true)
    setState({ error: null })

    try {
      const provider = await sdk.wallet.getEthereumProvider()
      if (!provider) {
        throw new Error('No Ethereum provider available')
      }

      console.log('[CreatePool] Starting pool creation:', {
        tokenA,
        tokenB,
        version,
        feeTier,
        amountA,
        amountB,
      })

      // Determine spender based on version
      const V2_ROUTER = '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24'
      const V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1'
      const V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc'

      const spender = version === 'v2' ? V2_ROUTER
                    : version === 'v3' ? V3_POSITION_MANAGER
                    : V4_POSITION_MANAGER

      // Convert amounts to wei for approval checking
      const decimals0 = tokenA.decimals
      const decimals1 = tokenB.decimals
      const amount0Wei = ethers.utils.parseUnits(amountA, decimals0).toString()
      const amount1Wei = ethers.utils.parseUnits(amountB, decimals1).toString()

      // Check approvals
      setCurrentStep('Preparing transactions...')
      const approvalStatus = await checkApprovals({
        token0: tokenA.address,
        token1: tokenB.address,
        owner: wallet,
        spender,
        amount0Required: amount0Wei,
        amount1Required: amount1Wei,
      })

      console.log('[CreatePool] Approval status:', approvalStatus)

      // Build all transactions to batch
      const allCalls: Array<{ to: string; data: string; value: string }> = []

      // Add approval transactions if needed
      if (approvalStatus.token0NeedsApproval) {
        const approval = await buildApprovalTransaction(
          tokenA.address,
          spender,
          amount0Wei,
          false
        )
        allCalls.push({ to: approval.to, data: approval.data, value: approval.value })
        console.log(`[CreatePool] Batching approval for ${tokenA.symbol}`)
      }

      if (approvalStatus.token1NeedsApproval) {
        const approval = await buildApprovalTransaction(
          tokenB.address,
          spender,
          amount1Wei,
          false
        )
        allCalls.push({ to: approval.to, data: approval.data, value: approval.value })
        console.log(`[CreatePool] Batching approval for ${tokenB.symbol}`)
      }

      // Build pool creation transactions
      const price = parseFloat(amountB) / parseFloat(amountA)
      const { transactions } = await buildCreatePoolTransaction({
        version,
        token0: tokenA.address,
        token1: tokenB.address,
        amount0: amountA,
        amount1: amountB,
        fee: version !== 'v2' ? feeTier : undefined,
        price,
        recipient: wallet,
        slippageTolerance: slippageTolerance,
      })

      // Add pool creation transactions
      transactions.forEach(tx => {
        allCalls.push({ to: tx.to, data: tx.data, value: tx.value })
      })

      console.log(`[CreatePool] Batching ${allCalls.length} total transactions`)

      // Use wallet_sendCalls (EIP-5792) to batch all transactions
      setCurrentStep('Awaiting wallet confirmation...')

      try {
        const result = await provider.request({
          method: 'wallet_sendCalls',
          params: [{
            version: '1.0',
            chainId: `0x${Number(8453).toString(16)}`, // Base mainnet
            from: wallet as any,
            calls: allCalls.map(call => ({
              to: call.to as any,
              data: call.data as any,
              value: call.value as any,
            })),
          }],
        })

        console.log('[CreatePool] Batch transaction result:', result)
        setCurrentStep('Transaction submitted successfully')

        alert('Pool created successfully! Transactions are processing.')
        window.location.href = '/positions'
      } catch (batchErr: any) {
        // Fallback to individual transactions if wallet_sendCalls is not supported
        if (batchErr.message?.includes('does not exist') || batchErr.message?.includes('not supported')) {
          console.log('[CreatePool] wallet_sendCalls not supported, falling back to individual transactions')
          setCurrentStep('Sending transactions individually...')

          for (let i = 0; i < allCalls.length; i++) {
            const call = allCalls[i]
            const txHash = await provider.request({
              method: 'eth_sendTransaction',
              params: [{
                from: wallet as any,
                to: call.to as any,
                data: call.data as any,
                value: call.value as any,
              }],
            })

            console.log(`[CreatePool] Transaction ${i + 1}/${allCalls.length}:`, txHash)

            if (i < allCalls.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 3000))
            }
          }

          alert('Pool created successfully!')
          window.location.href = '/positions'
        } else {
          throw batchErr
        }
      }
    } catch (err: any) {
      console.error('[CreatePool] Failed:', err)
      let errorMessage = 'Failed to create pool. Please try again.'

      if (err.message?.includes('User rejected')) {
        errorMessage = 'Transaction rejected by user'
      } else if (err.message?.includes('insufficient')) {
        errorMessage = 'Insufficient balance for this transaction'
      } else if (err.message) {
        errorMessage = err.message
      }

      setState({ error: errorMessage })
    } finally {
      setIsCreating(false)
      setCurrentStep('')
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
          <Link href="/" className="back-button">← Back</Link>
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
        <Link href="/" className="back-button">← Back</Link>
        <h2>Create New Pool</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {currentStep && (
        <div className="creating-status">
          <div className="spinner"></div>
          <p>{currentStep}</p>
        </div>
      )}

      {poolExists && poolAddress && (
        <div className="warning-banner">
          Pool already exists at {poolAddress.slice(0, 6)}...{poolAddress.slice(-4)}. You can add liquidity to the existing pool instead.
        </div>
      )}

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
              {FEE_TIERS.find(t => t.value === feeTier)?.warning && (
                <div className="fee-warning">
                  ⚠️ {FEE_TIERS.find(t => t.value === feeTier)?.warning}
                </div>
              )}
            </div>
          </div>
        )}

        <SlippageControl
          value={slippageTolerance}
          onChange={setSlippageTolerance}
          pairType="standard"
        />

        {/* Custom Token Price Input */}
        {((tokenA && tokenA.symbol === 'CUSTOM') || (tokenB && tokenB.symbol === 'CUSTOM')) && (
          <div className="create-section">
            <h3 className="section-title">Custom Token Pricing</h3>
            <div className="warning-banner">
              ⚠️ Unable to fetch price data for custom tokens. Please manually enter the current USD price.
              <br />
              <small>Make sure you enter accurate prices to ensure proper liquidity ratios.</small>
            </div>

            {tokenA && tokenA.symbol === 'CUSTOM' && (
              <div className="input-group">
                <div className="input-label">
                  <span>{tokenA.address.slice(0, 6)}...{tokenA.address.slice(-4)} Price (USD)</span>
                </div>
                <div className="input-wrapper">
                  <span className="input-token-label">$</span>
                  <input
                    type="number"
                    className="amount-input"
                    placeholder="0.00"
                    step="0.000001"
                    value={customPriceA}
                    onChange={(e) => setCustomPriceA(e.target.value)}
                  />
                </div>
              </div>
            )}

            {tokenB && tokenB.symbol === 'CUSTOM' && (
              <div className="input-group">
                <div className="input-label">
                  <span>{tokenB.address.slice(0, 6)}...{tokenB.address.slice(-4)} Price (USD)</span>
                </div>
                <div className="input-wrapper">
                  <span className="input-token-label">$</span>
                  <input
                    type="number"
                    className="amount-input"
                    placeholder="0.00"
                    step="0.000001"
                    value={customPriceB}
                    onChange={(e) => setCustomPriceB(e.target.value)}
                  />
                </div>
              </div>
            )}
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
                  <span className="input-balance">
                    Balance: {loadingBalanceA ? (
                      <span className="spinner-small"></span>
                    ) : balanceA ? (
                      <>
                        {parseFloat(balanceA).toFixed(6)} {tokenA.symbol}
                        {parseFloat(balanceA) < parseFloat(amountA || '0') && (
                          <span className="text-error"> (Insufficient)</span>
                        )}
                      </>
                    ) : (
                      '--'
                    )}
                  </span>
                </div>
                <div className="input-wrapper">
                  <input
                    type="number"
                    className="amount-input"
                    placeholder={balanceA ? `Balance: ${parseFloat(balanceA).toFixed(6)}` : '0.0'}
                    step="any"
                    value={amountA}
                    onChange={(e) => setAmountA(e.target.value)}
                  />
                  <span className="input-token-label">{tokenA.symbol}</span>
                </div>
                {balanceA && tokenA && (
                  <QuickSelectButtons
                    balance={balanceA}
                    decimals={tokenA.decimals}
                    onAmountSelect={setAmountA}
                    disabled={isCreating}
                  />
                )}
              </div>

              <div className="input-group">
                <div className="input-label">
                  <span>{tokenB.symbol} Amount</span>
                  <span className="input-balance">
                    Balance: {loadingBalanceB ? (
                      <span className="spinner-small"></span>
                    ) : balanceB ? (
                      <>
                        {parseFloat(balanceB).toFixed(6)} {tokenB.symbol}
                        {parseFloat(balanceB) < parseFloat(amountB || '0') && (
                          <span className="text-error"> (Insufficient)</span>
                        )}
                      </>
                    ) : (
                      '--'
                    )}
                  </span>
                </div>
                <div className="input-wrapper">
                  <input
                    type="number"
                    className="amount-input"
                    placeholder={balanceB ? `Balance: ${parseFloat(balanceB).toFixed(6)}` : '0.0'}
                    step="any"
                    value={amountB}
                    onChange={(e) => setAmountB(e.target.value)}
                  />
                  <span className="input-token-label">{tokenB.symbol}</span>
                </div>
                {balanceB && tokenB && (
                  <QuickSelectButtons
                    balance={balanceB}
                    decimals={tokenB.decimals}
                    onAmountSelect={setAmountB}
                    disabled={isCreating}
                  />
                )}
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
            onClick={handleInitiatePoolCreation}
            disabled={!canCreate || isCreating || poolExists}
          >
            {isCreating ? (currentStep || 'Creating Pool...') : 'Create Pool & Add Liquidity'}
          </button>
        </div>

        <div className="create-info">
          <p className="text-secondary">
            Creating a new pool will initialize it with your chosen ratio and add your initial liquidity.
          </p>
        </div>
      </div>

      <TransactionConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleCreatePool}
        title="Confirm Pool Creation"
        details={[
          { label: `${tokenA?.symbol} Amount`, value: amountA },
          { label: `${tokenB?.symbol} Amount`, value: amountB },
          { label: 'Fee Tier', value: FEE_TIERS.find(t => t.value === feeTier)?.label || '' },
          { label: 'Initial Price', value: initialPrice ? `1 ${tokenA?.symbol} = ${initialPrice} ${tokenB?.symbol}` : '' },
          { label: 'Slippage', value: `${slippageTolerance}%` },
        ]}
      />

      <Footer />
    </div>
  )
}
