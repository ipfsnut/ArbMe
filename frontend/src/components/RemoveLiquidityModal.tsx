import { useState, useCallback, useEffect } from 'react'
import { Modal } from './Modal'
import type { Position, V3Position, V4Position } from '../lib/api'
import { getTokenByAddress } from '../lib/constants'
import { useFarcaster } from '../hooks/useFarcaster'
import { formatTokenAmount } from '../lib/transactions'
import { API_BASE_URL } from '../lib/wagmi'

interface RemoveLiquidityModalProps {
  isOpen: boolean
  onClose: () => void
  position: Position | null
  onSuccess?: () => void
}

type TxStatus = 'idle' | 'building' | 'removing' | 'collecting' | 'success' | 'error'

export function RemoveLiquidityModal({
  isOpen,
  onClose,
  position,
  onSuccess,
}: RemoveLiquidityModalProps) {
  const { address, getProvider } = useFarcaster()
  const [percentage, setPercentage] = useState(100)
  const [status, setStatus] = useState<TxStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Get token info - handle all position types
  const getTokenAddresses = () => {
    if (!position) return { token0Addr: undefined, token1Addr: undefined }
    if (position.type === 'V4') {
      return { token0Addr: position.currency0, token1Addr: position.currency1 }
    }
    if (position.type === 'V3') {
      return { token0Addr: position.token0Address, token1Addr: position.token1Address }
    }
    // V2
    return { token0Addr: position.token0, token1Addr: position.token1 }
  }
  const { token0Addr: token0Address, token1Addr: token1Address } = getTokenAddresses()

  const token0 = token0Address ? getTokenByAddress(token0Address) : null
  const token1 = token1Address ? getTokenByAddress(token1Address) : null

  // Get token symbols - handle all position types
  const getTokenSymbols = () => {
    if (!position) return { sym0: 'Token0', sym1: 'Token1' }
    if (position.type === 'V4') {
      return { sym0: position.token0Symbol, sym1: position.token1Symbol }
    }
    if (position.type === 'V3') {
      return { sym0: position.token0, sym1: position.token1 }
    }
    return { sym0: position.token0Symbol, sym1: position.token1Symbol }
  }
  const { sym0, sym1 } = getTokenSymbols()
  const token0Symbol = token0?.symbol || sym0 || 'Token0'
  const token1Symbol = token1?.symbol || sym1 || 'Token1'

  // Calculate amounts to receive
  const amount0ToReceive = (position?.token0Amount || 0) * (percentage / 100)
  const amount1ToReceive = (position?.token1Amount || 0) * (percentage / 100)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPercentage(100)
      setStatus('idle')
      setStatusMessage('')
      setError(null)
    }
  }, [isOpen])

  const handleSubmit = useCallback(async () => {
    if (!address || !position) {
      setError('No position selected')
      return
    }

    const provider = getProvider()
    if (!provider) {
      setError('No wallet provider available')
      return
    }

    setStatus('building')
    setStatusMessage('Preparing transaction...')
    setError(null)

    try {
      if (position.type === 'V4') {
        const v4Position = position as V4Position

        // Calculate liquidity to remove
        const liquidityToRemove = (BigInt(v4Position.liquidity) * BigInt(percentage)) / BigInt(100)

        // Build remove liquidity transaction via API
        const buildRes = await fetch(`${API_BASE_URL}/test/rpc?action=buildV4RemoveLiquidity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: address,
            tokenId: v4Position.tokenId,
            currency0: v4Position.currency0,
            currency1: v4Position.currency1,
            fee: v4Position.fee,
            tickSpacing: v4Position.tickSpacing,
            hooks: v4Position.hooks,
            tickLower: v4Position.tickLower,
            tickUpper: v4Position.tickUpper,
            liquidity: liquidityToRemove.toString(),
            collectFees: v4Position.hasUnclaimedFees,
          }),
        })
        const buildData = await buildRes.json()

        if (buildData.error) {
          throw new Error(buildData.error)
        }

        setStatus('removing')
        setStatusMessage('Removing liquidity...')

        // Send the transaction
        await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: buildData.to,
            data: buildData.data,
            gas: buildData.gas || '0x7A120',
            value: '0x0',
          }],
        })

        setStatus('success')
        setStatusMessage('Liquidity removed successfully!')

        setTimeout(() => {
          onSuccess?.()
          onClose()
        }, 2000)

      } else if (position.type === 'V3') {
        const v3Position = position as V3Position

        // For V3, use decreaseLiquidity + collect
        const liquidityToRemove = (BigInt(v3Position.liquidity) * BigInt(percentage)) / BigInt(100)

        setStatus('removing')
        setStatusMessage('Removing liquidity...')

        // Build V3 remove transaction
        const buildRes = await fetch(`${API_BASE_URL}/test/rpc?action=buildV3RemoveLiquidity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: address,
            tokenId: v3Position.tokenId,
            liquidity: liquidityToRemove.toString(),
            collectFees: true,
          }),
        })
        const buildData = await buildRes.json()

        if (buildData.error) {
          throw new Error(buildData.error)
        }

        await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: buildData.to,
            data: buildData.data,
            gas: buildData.gas || '0x7A120',
            value: '0x0',
          }],
        })

        setStatus('success')
        setStatusMessage('Liquidity removed successfully!')

        setTimeout(() => {
          onSuccess?.()
          onClose()
        }, 2000)

      } else {
        // V2
        setError('V2 remove liquidity not yet implemented in new UI')
      }
    } catch (e) {
      console.error('Remove liquidity failed:', e)
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Transaction failed')
    }
  }, [address, position, percentage, getProvider, onSuccess, onClose])

  const isLoading = status === 'building' || status === 'removing' || status === 'collecting'

  if (!position) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Remove Liquidity">
      <div className="remove-liquidity-form">
        {/* Amount Slider */}
        <div className="input-group">
          <div className="input-label">
            <span>Amount to Remove</span>
            <span className="percentage-display">{percentage}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={percentage}
            onChange={(e) => setPercentage(parseInt(e.target.value))}
            className="percentage-slider"
            disabled={isLoading}
          />
          <div className="percentage-buttons">
            <button onClick={() => setPercentage(25)} disabled={isLoading}>25%</button>
            <button onClick={() => setPercentage(50)} disabled={isLoading}>50%</button>
            <button onClick={() => setPercentage(75)} disabled={isLoading}>75%</button>
            <button onClick={() => setPercentage(100)} disabled={isLoading}>100%</button>
          </div>
        </div>

        {/* Preview */}
        <div className="remove-preview">
          <div className="preview-header">You will receive</div>
          <div className="preview-amounts">
            <div className="preview-row">
              <span className="token-symbol">{token0Symbol}</span>
              <span className="amount">{formatTokenAmount(amount0ToReceive)}</span>
            </div>
            <div className="preview-row">
              <span className="token-symbol">{token1Symbol}</span>
              <span className="amount">{formatTokenAmount(amount1ToReceive)}</span>
            </div>
          </div>
          {(position.type === 'V3' || position.type === 'V4') && position.hasUnclaimedFees && (
            <div className="fees-note">
              + Unclaimed fees will be collected
            </div>
          )}
        </div>

        {/* Status */}
        {statusMessage && (
          <div className={`tx-status ${status}`}>
            {isLoading && <div className="loading-spinner small" />}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="tx-error">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          className="btn btn-primary full-width"
          onClick={handleSubmit}
          disabled={isLoading || percentage === 0}
        >
          {isLoading ? 'Processing...' : status === 'success' ? 'Success!' : 'Remove Liquidity'}
        </button>
      </div>
    </Modal>
  )
}
