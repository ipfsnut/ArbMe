'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAppState } from '@/store/AppContext'
import { useWallet } from '@/hooks/useWallet'
import {
  fetchPosition,
  buildCollectFeesTransaction,
  buildIncreaseLiquidityTransaction,
  buildDecreaseLiquidityTransaction,
  buildBurnPositionTransaction,
  fetchTokenBalance,
} from '@/services/api'
import { formatUsd } from '@/utils/format'
import type { Position } from '@/utils/types'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import Link from 'next/link'
import sdk from '@farcaster/miniapp-sdk'
import { QuickSelectButtons } from '@/components/QuickSelectButtons'

type ActionMode = 'view' | 'add' | 'remove' | 'close'

export default function PositionDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { state } = useAppState()
  const { error } = state
  const wallet = useWallet()
  const [position, setPosition] = useState<Position | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionMode, setActionMode] = useState<ActionMode>('view')
  const [processing, setProcessing] = useState(false)

  // Add liquidity inputs
  const [amount0Input, setAmount0Input] = useState('')
  const [amount1Input, setAmount1Input] = useState('')

  // Remove liquidity inputs
  const [removePercentage, setRemovePercentage] = useState(100)

  // Balance tracking
  const [balance0, setBalance0] = useState<string>('')
  const [balance1, setBalance1] = useState<string>('')
  const [loadingBalance0, setLoadingBalance0] = useState(false)
  const [loadingBalance1, setLoadingBalance1] = useState(false)

  useEffect(() => {
    if (wallet && id) {
      loadPosition()
    }
  }, [wallet, id])

  async function loadPosition() {
    if (!wallet || !id) {
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      console.log('[PositionDetail] Fetching position:', id, 'for wallet:', wallet)
      const data = await fetchPosition(id, wallet)
      console.log('[PositionDetail] Received position:', data)
      setPosition(data)
      setLoading(false)
    } catch (err) {
      console.error('[PositionDetail] Failed to load position:', err)
      setLoading(false)
    }
  }

  // Fetch balance for token0
  useEffect(() => {
    if (!wallet || !position) {
      setBalance0('')
      return
    }

    const token0Address = position.token0?.symbol ? getTokenAddress(position.token0.symbol) : null
    if (!token0Address) return

    setLoadingBalance0(true)
    fetchTokenBalance(token0Address, wallet)
      .then(({ balanceFormatted }) => {
        setBalance0(balanceFormatted)
      })
      .catch(err => {
        console.error('[PositionDetail] Failed to fetch balance 0:', err)
      })
      .finally(() => {
        setLoadingBalance0(false)
      })
  }, [wallet, position])

  // Fetch balance for token1
  useEffect(() => {
    if (!wallet || !position) {
      setBalance1('')
      return
    }

    const token1Address = position.token1?.symbol ? getTokenAddress(position.token1.symbol) : null
    if (!token1Address) return

    setLoadingBalance1(true)
    fetchTokenBalance(token1Address, wallet)
      .then(({ balanceFormatted }) => {
        setBalance1(balanceFormatted)
      })
      .catch(err => {
        console.error('[PositionDetail] Failed to fetch balance 1:', err)
      })
      .finally(() => {
        setLoadingBalance1(false)
      })
  }, [wallet, position])

  // Helper function to get token address from symbol (simplified)
  function getTokenAddress(symbol: string): string | null {
    // This would need to be properly implemented based on your token list
    const COMMON_TOKENS: Record<string, string> = {
      'WETH': '0x4200000000000000000000000000000000000006',
      'ARBME': '0x...',  // Add actual ARBME address
      // Add other common tokens
    }
    return COMMON_TOKENS[symbol] || null
  }

  async function handleCollectFees() {
    if (!wallet || !position) return

    setProcessing(true)

    try {
      console.log('[PositionDetail] Building collect fees transaction')
      const transaction = await buildCollectFeesTransaction(position.id, wallet)
      const provider = await sdk.wallet.getEthereumProvider()

      if (!provider) throw new Error('No Ethereum provider available')

      console.log('[PositionDetail] Sending transaction')
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet as `0x${string}`,
          to: transaction.to as `0x${string}`,
          data: transaction.data as `0x${string}`,
          value: transaction.value as `0x${string}`,
        }],
      })

      console.log('[PositionDetail] Transaction sent:', txHash)

      setTimeout(async () => {
        await loadPosition()
        alert('Fees collected successfully!')
        setProcessing(false)
      }, 3000)

    } catch (err) {
      console.error('[PositionDetail] Fee collection failed:', err)
      alert(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setProcessing(false)
    }
  }

  async function handleAddLiquidity() {
    if (!wallet || !position || !amount0Input || !amount1Input) {
      alert('Please enter both token amounts')
      return
    }

    setProcessing(true)

    try {
      // Convert human-readable amounts to wei
      const decimals0 = position.token0.amount ? 18 : 18 // TODO: get actual decimals
      const decimals1 = position.token1.amount ? 18 : 18
      const amount0Wei = (parseFloat(amount0Input) * Math.pow(10, decimals0)).toString()
      const amount1Wei = (parseFloat(amount1Input) * Math.pow(10, decimals1)).toString()

      console.log('[PositionDetail] Building add liquidity transaction')
      const transaction = await buildIncreaseLiquidityTransaction(
        position.id,
        amount0Wei,
        amount1Wei,
        0.5 // 0.5% slippage
      )

      const provider = await sdk.wallet.getEthereumProvider()
      if (!provider) throw new Error('No Ethereum provider available')

      console.log('[PositionDetail] Sending transaction')
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet as `0x${string}`,
          to: transaction.to as `0x${string}`,
          data: transaction.data as `0x${string}`,
          value: transaction.value as `0x${string}`,
        }],
      })

      console.log('[PositionDetail] Transaction sent:', txHash)

      setTimeout(async () => {
        await loadPosition()
        setActionMode('view')
        setAmount0Input('')
        setAmount1Input('')
        alert('Liquidity added successfully!')
        setProcessing(false)
      }, 3000)

    } catch (err) {
      console.error('[PositionDetail] Add liquidity failed:', err)
      alert(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setProcessing(false)
    }
  }

  async function handleRemoveLiquidity() {
    if (!wallet || !position) return

    setProcessing(true)

    try {
      // Get current liquidity from position (extract numeric value)
      const currentLiquidity = position.liquidity?.replace(/[^\d]/g, '') || '0'

      console.log('[PositionDetail] Building remove liquidity transaction')
      const transaction = await buildDecreaseLiquidityTransaction(
        position.id,
        removePercentage,
        currentLiquidity,
        0.5 // 0.5% slippage
      )

      const provider = await sdk.wallet.getEthereumProvider()
      if (!provider) throw new Error('No Ethereum provider available')

      console.log('[PositionDetail] Sending transaction')
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet as `0x${string}`,
          to: transaction.to as `0x${string}`,
          data: transaction.data as `0x${string}`,
          value: transaction.value as `0x${string}`,
        }],
      })

      console.log('[PositionDetail] Transaction sent:', txHash)

      setTimeout(async () => {
        await loadPosition()
        setActionMode('view')
        alert(`${removePercentage}% of liquidity removed successfully!`)
        setProcessing(false)
      }, 3000)

    } catch (err) {
      console.error('[PositionDetail] Remove liquidity failed:', err)
      alert(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setProcessing(false)
    }
  }

  async function handleClosePosition() {
    if (!wallet || !position) return

    if (!confirm('This will remove ALL liquidity and close the position. Continue?')) {
      return
    }

    setProcessing(true)

    try {
      // Step 1: Remove all liquidity (100%)
      const currentLiquidity = position.liquidity?.replace(/[^\d]/g, '') || '0'
      console.log('[PositionDetail] Step 1: Removing all liquidity')

      const decreaseTransaction = await buildDecreaseLiquidityTransaction(
        position.id,
        100,
        currentLiquidity,
        0.5
      )

      const provider = await sdk.wallet.getEthereumProvider()
      if (!provider) throw new Error('No Ethereum provider available')

      await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet as `0x${string}`,
          to: decreaseTransaction.to as `0x${string}`,
          data: decreaseTransaction.data as `0x${string}`,
          value: decreaseTransaction.value as `0x${string}`,
        }],
      })

      // Wait for decrease to confirm
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Step 2: Collect any remaining fees
      console.log('[PositionDetail] Step 2: Collecting fees')
      const collectTransaction = await buildCollectFeesTransaction(position.id, wallet)

      await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet as `0x${string}`,
          to: collectTransaction.to as `0x${string}`,
          data: collectTransaction.data as `0x${string}`,
          value: collectTransaction.value as `0x${string}`,
        }],
      })

      // Wait for collect to confirm
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Step 3: Burn the position NFT
      console.log('[PositionDetail] Step 3: Burning position')
      const burnTransaction = await buildBurnPositionTransaction(position.id)

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet as `0x${string}`,
          to: burnTransaction.to as `0x${string}`,
          data: burnTransaction.data as `0x${string}`,
          value: burnTransaction.value as `0x${string}`,
        }],
      })

      console.log('[PositionDetail] Position burned:', txHash)

      alert('Position closed successfully! Redirecting...')
      window.location.href = '/positions'

    } catch (err) {
      console.error('[PositionDetail] Close position failed:', err)
      alert(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setProcessing(false)
    }
  }

  if (!wallet || !id) {
    return (
      <div className="position-detail-page">
        <AppHeader />
        <div className="page-subheader">
          <Link href="/positions" className="back-button">← Back to Positions</Link>
          <h2>Position Details</h2>
        </div>
        <div className="empty-state">
          <p className="text-secondary">Wallet not connected or invalid position ID</p>
        </div>
      </div>
    )
  }

  if (loading || !position) {
    return (
      <div className="position-detail-page">
        <AppHeader />
        <div className="page-subheader">
          <Link href="/positions" className="back-button">← Back to Positions</Link>
          <h2>Position Details</h2>
        </div>

        <div className="loading-state">
          <div className="spinner"></div>
          <p className="text-secondary">Loading position...</p>
        </div>
      </div>
    )
  }

  const inRangeBadge = position.inRange !== undefined
    ? position.inRange
      ? <span className="badge badge-success">✓ In Range</span>
      : <span className="badge badge-warning">⚠ Out of Range</span>
    : null

  return (
    <div className="position-detail-page">
      <AppHeader />
      <div className="page-subheader">
        <Link href="/positions" className="back-button">← Back to Positions</Link>
        <h2>{position.pair} Position</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="position-detail-card">
        <div className="detail-header">
          <h2>{position.pair}</h2>
          <span className="position-version text-secondary">{position.version}</span>
        </div>

        <div className="detail-section">
          <h3>Value</h3>
          <div className="detail-stats">
            <div className="stat-large">
              <span className="stat-label text-secondary">Your Liquidity</span>
              <span className="stat-value">{formatUsd(position.liquidityUsd)}</span>
            </div>
            <div className="stat-large">
              <span className="stat-label text-secondary">Uncollected Fees</span>
              <span className="stat-value text-positive">
                {formatUsd(position.feesEarnedUsd)}
              </span>
            </div>
          </div>
        </div>

        <div className="detail-section">
          <h3>Token Amounts</h3>
          <div className="detail-list">
            <div className="detail-item">
              <span className="text-secondary">{position.token0.symbol}</span>
              <span>{position.token0.amount.toFixed(6)}</span>
            </div>
            <div className="detail-item">
              <span className="text-secondary">{position.token1.symbol}</span>
              <span>{position.token1.amount.toFixed(6)}</span>
            </div>
          </div>
        </div>

        {position.priceRange && (
          <div className="detail-section">
            <h3>Price Range</h3>
            <div className="detail-list">
              <div className="detail-item">
                <span className="text-secondary">Min Price</span>
                <span>${position.priceRange.min.toFixed(6)}</span>
              </div>
              <div className="detail-item">
                <span className="text-secondary">Max Price</span>
                <span>${position.priceRange.max.toFixed(6)}</span>
              </div>
              <div className="detail-item">
                <span className="text-secondary">Status</span>
                {inRangeBadge}
              </div>
            </div>
          </div>
        )}

        {/* Action Mode Selection */}
        {actionMode === 'view' && (
          <div className="detail-actions">
            <button
              onClick={handleCollectFees}
              disabled={position.feesEarnedUsd === 0 || processing}
              className="button-primary"
            >
              {processing ? 'Collecting...' : 'Collect Fees'}
            </button>
            <button
              onClick={() => setActionMode('add')}
              className="button-secondary"
            >
              Add Liquidity
            </button>
            <button
              onClick={() => setActionMode('remove')}
              className="button-secondary"
            >
              Remove Liquidity
            </button>
            <button
              onClick={() => setActionMode('close')}
              className="button-warning"
            >
              Close Position
            </button>
          </div>
        )}

        {/* Add Liquidity Form */}
        {actionMode === 'add' && (
          <div className="liquidity-form">
            <h3>Add Liquidity</h3>
            <div className="form-group">
              <div className="input-label">
                <label>{position.token0.symbol} Amount</label>
                <span className="input-balance">
                  Balance: {loadingBalance0 ? (
                    <span className="spinner-small"></span>
                  ) : balance0 ? (
                    <>
                      {parseFloat(balance0).toFixed(6)}
                      {parseFloat(balance0) < parseFloat(amount0Input || '0') && (
                        <span className="text-error"> (Insufficient)</span>
                      )}
                    </>
                  ) : (
                    '--'
                  )}
                </span>
              </div>
              <input
                type="number"
                value={amount0Input}
                onChange={(e) => setAmount0Input(e.target.value)}
                placeholder="0.0"
                step="0.000001"
                disabled={processing}
              />
              {balance0 && (
                <QuickSelectButtons
                  balance={balance0}
                  decimals={18}
                  onAmountSelect={setAmount0Input}
                  disabled={processing}
                />
              )}
            </div>
            <div className="form-group">
              <div className="input-label">
                <label>{position.token1.symbol} Amount</label>
                <span className="input-balance">
                  Balance: {loadingBalance1 ? (
                    <span className="spinner-small"></span>
                  ) : balance1 ? (
                    <>
                      {parseFloat(balance1).toFixed(6)}
                      {parseFloat(balance1) < parseFloat(amount1Input || '0') && (
                        <span className="text-error"> (Insufficient)</span>
                      )}
                    </>
                  ) : (
                    '--'
                  )}
                </span>
              </div>
              <input
                type="number"
                value={amount1Input}
                onChange={(e) => setAmount1Input(e.target.value)}
                placeholder="0.0"
                step="0.000001"
                disabled={processing}
              />
              {balance1 && (
                <QuickSelectButtons
                  balance={balance1}
                  decimals={18}
                  onAmountSelect={setAmount1Input}
                  disabled={processing}
                />
              )}
            </div>
            <div className="form-actions">
              <button
                onClick={handleAddLiquidity}
                disabled={processing || !amount0Input || !amount1Input}
                className="button-primary"
              >
                {processing ? 'Adding...' : 'Add Liquidity'}
              </button>
              <button
                onClick={() => {
                  setActionMode('view')
                  setAmount0Input('')
                  setAmount1Input('')
                }}
                disabled={processing}
                className="button-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Remove Liquidity Form */}
        {actionMode === 'remove' && (
          <div className="liquidity-form">
            <h3>Remove Liquidity</h3>
            <div className="form-group">
              <label>Percentage to Remove: {removePercentage}%</label>
              <input
                type="range"
                min="1"
                max="100"
                value={removePercentage}
                onChange={(e) => setRemovePercentage(Number(e.target.value))}
                disabled={processing}
                className="slider"
              />
              <div className="slider-labels">
                <span>1%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>
            <div className="removal-preview">
              <p className="text-secondary">
                You will receive approximately:
              </p>
              <p>
                {(position.token0.amount * removePercentage / 100).toFixed(6)} {position.token0.symbol}
              </p>
              <p>
                {(position.token1.amount * removePercentage / 100).toFixed(6)} {position.token1.symbol}
              </p>
            </div>
            <div className="form-actions">
              <button
                onClick={handleRemoveLiquidity}
                disabled={processing}
                className="button-warning"
              >
                {processing ? 'Removing...' : `Remove ${removePercentage}%`}
              </button>
              <button
                onClick={() => {
                  setActionMode('view')
                  setRemovePercentage(100)
                }}
                disabled={processing}
                className="button-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Close Position Confirmation */}
        {actionMode === 'close' && (
          <div className="liquidity-form close-warning">
            <h3>⚠️ Close Position</h3>
            <p className="text-secondary">
              This will:
            </p>
            <ol>
              <li>Remove 100% of your liquidity</li>
              <li>Collect all uncollected fees</li>
              <li>Burn the position NFT (irreversible)</li>
            </ol>
            <p className="text-warning">
              You will receive all tokens back to your wallet.
            </p>
            <div className="form-actions">
              <button
                onClick={handleClosePosition}
                disabled={processing}
                className="button-danger"
              >
                {processing ? 'Closing...' : 'Yes, Close Position'}
              </button>
              <button
                onClick={() => setActionMode('view')}
                disabled={processing}
                className="button-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}
