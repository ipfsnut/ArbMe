import { useState, useCallback, useEffect } from 'react'
import { Modal } from './Modal'
import type { PoolData } from '../lib/api'
import type { Position } from '../lib/api'
import { getTokenByAddress } from '../lib/constants'
import { useFarcaster } from '../hooks/useFarcaster'
import { formatTokenAmount, parseAmount, sortTokens, executeV4Approvals } from '../lib/transactions'
import { API_BASE_URL } from '../lib/wagmi'

interface AddLiquidityModalProps {
  isOpen: boolean
  onClose: () => void
  pool?: PoolData | null
  position?: Position | null
  onSuccess?: () => void
}

type TxStatus = 'idle' | 'checking' | 'approving' | 'adding' | 'success' | 'error'

export function AddLiquidityModal({
  isOpen,
  onClose,
  pool,
  position,
  onSuccess,
}: AddLiquidityModalProps) {
  const { address, getProvider } = useFarcaster()
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [balance0, setBalance0] = useState<number>(0)
  const [balance1, setBalance1] = useState<number>(0)
  const [status, setStatus] = useState<TxStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Get token info - handle all position types
  const getToken0Address = () => {
    if (pool) return pool.token0
    if (!position) return undefined
    if (position.type === 'V4') return position.currency0
    if (position.type === 'V3') return position.token0Address
    return position.token0 // V2
  }
  const getToken1Address = () => {
    if (pool) return pool.token1
    if (!position) return undefined
    if (position.type === 'V4') return position.currency1
    if (position.type === 'V3') return position.token1Address
    return position.token1 // V2
  }
  const token0Address = getToken0Address()
  const token1Address = getToken1Address()
  const token0 = token0Address ? getTokenByAddress(token0Address) : null
  const token1 = token1Address ? getTokenByAddress(token1Address) : null

  const token0Symbol = token0?.symbol || pool?.token0Symbol || 'Token0'
  const token1Symbol = token1?.symbol || pool?.token1Symbol || 'Token1'
  const decimals0 = token0?.decimals ?? 18
  const decimals1 = token1?.decimals ?? 18

  // Load balances
  useEffect(() => {
    if (!address || !token0Address || !token1Address) return

    async function loadBalances() {
      try {
        const [bal0Res, bal1Res] = await Promise.all([
          fetch(`${API_BASE_URL}/test/rpc?action=tokenBalance&wallet=${address}&token=${token0Address}`),
          fetch(`${API_BASE_URL}/test/rpc?action=tokenBalance&wallet=${address}&token=${token1Address}`),
        ])
        const bal0 = await bal0Res.json()
        const bal1 = await bal1Res.json()
        setBalance0(bal0.balanceFormatted || 0)
        setBalance1(bal1.balanceFormatted || 0)
      } catch (e) {
        console.error('Failed to load balances:', e)
      }
    }

    loadBalances()
  }, [address, token0Address, token1Address])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount0('')
      setAmount1('')
      setStatus('idle')
      setStatusMessage('')
      setError(null)
    }
  }, [isOpen])

  const handleMaxClick = (tokenIndex: 0 | 1) => {
    if (tokenIndex === 0) {
      setAmount0(balance0.toString())
    } else {
      setAmount1(balance1.toString())
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!address || !token0Address || !token1Address) {
      setError('Wallet not connected')
      return
    }

    const provider = getProvider()
    if (!provider) {
      setError('No wallet provider available')
      return
    }

    const amt0 = parseFloat(amount0) || 0
    const amt1 = parseFloat(amount1) || 0

    if (amt0 <= 0 && amt1 <= 0) {
      setError('Please enter an amount')
      return
    }

    setStatus('checking')
    setError(null)

    try {
      // For V4 positions
      if (position?.type === 'V4' || pool?.dex.includes('V4')) {
        // Sort tokens
        const sorted = sortTokens(
          { address: token0Address, symbol: token0Symbol, decimals: decimals0 },
          { address: token1Address, symbol: token1Symbol, decimals: decimals1 },
          amt0,
          amt1
        )

        const amount0Raw = parseAmount(sorted.amount0.toString(), sorted.decimals0)
        const amount1Raw = parseAmount(sorted.amount1.toString(), sorted.decimals1)

        // Execute approvals
        setStatus('approving')
        await executeV4Approvals(
          provider,
          address,
          sorted.currency0,
          sorted.currency1,
          amount0Raw,
          amount1Raw,
          (msg) => setStatusMessage(msg)
        )

        // Build and send add liquidity transaction
        setStatus('adding')
        setStatusMessage('Adding liquidity...')

        // For now, call the API to build the transaction
        // This would need to be implemented properly with the V4 calldata encoding
        const buildRes = await fetch(`${API_BASE_URL}/test/rpc?action=buildV4AddLiquidity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: address,
            tokenId: position?.type === 'V4' ? position.tokenId : undefined,
            currency0: sorted.currency0,
            currency1: sorted.currency1,
            fee: position?.type === 'V4' ? position.fee : 10000,
            tickSpacing: position?.type === 'V4' ? position.tickSpacing : 200,
            hooks: position?.type === 'V4' ? position.hooks : '0x0000000000000000000000000000000000000000',
            amount0: amount0Raw.toString(),
            amount1: amount1Raw.toString(),
          }),
        })
        const buildData = await buildRes.json()

        if (buildData.error) {
          throw new Error(buildData.error)
        }

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
        setStatusMessage('Liquidity added successfully!')

        // Wait and close
        setTimeout(() => {
          onSuccess?.()
          onClose()
        }, 2000)
      } else {
        // V2/V3 would have different logic
        setError('V2/V3 add liquidity not yet implemented in new UI')
      }
    } catch (e) {
      console.error('Add liquidity failed:', e)
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Transaction failed')
    }
  }, [address, amount0, amount1, token0Address, token1Address, token0Symbol, token1Symbol, decimals0, decimals1, pool, position, getProvider, onSuccess, onClose])

  const isLoading = status === 'checking' || status === 'approving' || status === 'adding'
  const title = position ? `Add to ${token0Symbol}/${token1Symbol}` : `Add Liquidity`

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="add-liquidity-form">
        {/* Token 0 Input */}
        <div className="input-group">
          <div className="input-label">
            <span>{token0Symbol}</span>
            <span
              className="input-balance"
              onClick={() => handleMaxClick(0)}
            >
              Balance: {formatTokenAmount(balance0)}
            </span>
          </div>
          <div className="input-wrapper">
            <input
              type="number"
              className="amount-input"
              placeholder="0.0"
              value={amount0}
              onChange={(e) => setAmount0(e.target.value)}
              disabled={isLoading}
            />
            <div className="input-token">
              {token0?.icon && <img src={token0.icon} alt={token0Symbol} />}
              <span>{token0Symbol}</span>
            </div>
          </div>
        </div>

        {/* Token 1 Input */}
        <div className="input-group">
          <div className="input-label">
            <span>{token1Symbol}</span>
            <span
              className="input-balance"
              onClick={() => handleMaxClick(1)}
            >
              Balance: {formatTokenAmount(balance1)}
            </span>
          </div>
          <div className="input-wrapper">
            <input
              type="number"
              className="amount-input"
              placeholder="0.0"
              value={amount1}
              onChange={(e) => setAmount1(e.target.value)}
              disabled={isLoading}
            />
            <div className="input-token">
              {token1?.icon && <img src={token1.icon} alt={token1Symbol} />}
              <span>{token1Symbol}</span>
            </div>
          </div>
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
          disabled={isLoading || (!amount0 && !amount1)}
        >
          {isLoading ? 'Processing...' : status === 'success' ? 'Success!' : 'Add Liquidity'}
        </button>
      </div>
    </Modal>
  )
}
