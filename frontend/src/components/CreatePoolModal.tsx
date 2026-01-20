import { useState, useCallback, useEffect } from 'react'
import { Modal } from './Modal'
import { KNOWN_TOKENS, getTokenByAddress } from '../lib/constants'
import { useFarcaster } from '../hooks/useFarcaster'
import { formatTokenAmount, parseAmount, sortTokens, executeV4Approvals } from '../lib/transactions'
import { API_BASE_URL } from '../lib/wagmi'

interface CreatePoolModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

type TxStatus = 'idle' | 'checking' | 'approving' | 'creating' | 'success' | 'error'

const FEE_TIERS = [
  { fee: 500, label: '0.05%', tickSpacing: 10 },
  { fee: 3000, label: '0.3%', tickSpacing: 60 },
  { fee: 10000, label: '1%', tickSpacing: 200 },
]

export function CreatePoolModal({
  isOpen,
  onClose,
  onSuccess,
}: CreatePoolModalProps) {
  const { address, getProvider } = useFarcaster()
  const [token0, setToken0] = useState('')
  const [token1, setToken1] = useState('')
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [feeTier, setFeeTier] = useState(10000)
  const [balance0, setBalance0] = useState<number>(0)
  const [balance1, setBalance1] = useState<number>(0)
  const [status, setStatus] = useState<TxStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Available tokens for selection
  const availableTokens = Object.values(KNOWN_TOKENS)

  const token0Info = token0 ? getTokenByAddress(token0) : null
  const token1Info = token1 ? getTokenByAddress(token1) : null

  const selectedFeeTier = FEE_TIERS.find(f => f.fee === feeTier) || FEE_TIERS[2]

  // Load balances when tokens are selected
  useEffect(() => {
    if (!address) return

    async function loadBalance(tokenAddress: string, setBalance: (b: number) => void) {
      try {
        const res = await fetch(`${API_BASE_URL}/test/rpc?action=tokenBalance&wallet=${address}&token=${tokenAddress}`)
        const data = await res.json()
        setBalance(data.balanceFormatted || 0)
      } catch (e) {
        console.error('Failed to load balance:', e)
      }
    }

    if (token0) loadBalance(token0, setBalance0)
    if (token1) loadBalance(token1, setBalance1)
  }, [address, token0, token1])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setToken0('')
      setToken1('')
      setAmount0('')
      setAmount1('')
      setFeeTier(10000)
      setBalance0(0)
      setBalance1(0)
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
    if (!address || !token0 || !token1) {
      setError('Please select both tokens')
      return
    }

    if (token0 === token1) {
      setError('Please select different tokens')
      return
    }

    const provider = getProvider()
    if (!provider) {
      setError('No wallet provider available')
      return
    }

    const amt0 = parseFloat(amount0) || 0
    const amt1 = parseFloat(amount1) || 0

    if (amt0 <= 0 || amt1 <= 0) {
      setError('Please enter amounts for both tokens')
      return
    }

    setStatus('checking')
    setError(null)

    try {
      const decimals0 = token0Info?.decimals ?? 18
      const decimals1 = token1Info?.decimals ?? 18

      // Sort tokens for V4
      const sorted = sortTokens(
        { address: token0, symbol: token0Info?.symbol || 'Token0', decimals: decimals0 },
        { address: token1, symbol: token1Info?.symbol || 'Token1', decimals: decimals1 },
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

      // Create pool and add initial liquidity
      setStatus('creating')
      setStatusMessage('Creating pool...')

      const buildRes = await fetch(`${API_BASE_URL}/test/rpc?action=createV4Pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          currency0: sorted.currency0,
          currency1: sorted.currency1,
          fee: feeTier,
          tickSpacing: selectedFeeTier.tickSpacing,
          hooks: '0x0000000000000000000000000000000000000000',
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
      setStatusMessage('Pool created successfully!')

      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 2000)

    } catch (e) {
      console.error('Create pool failed:', e)
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Transaction failed')
    }
  }, [address, token0, token1, amount0, amount1, token0Info, token1Info, feeTier, selectedFeeTier, getProvider, onSuccess, onClose])

  const isLoading = status === 'checking' || status === 'approving' || status === 'creating'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create V4 Pool">
      <div className="create-pool-form">
        {/* Token Selection */}
        <div className="input-group">
          <div className="input-label">
            <span>Token A</span>
            {token0 && (
              <span className="input-balance" onClick={() => handleMaxClick(0)}>
                Balance: {formatTokenAmount(balance0)}
              </span>
            )}
          </div>
          <select
            className="token-select"
            value={token0}
            onChange={(e) => setToken0(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Select token</option>
            {availableTokens.map((t) => (
              <option key={t.address} value={t.address} disabled={t.address === token1}>
                {t.symbol}
              </option>
            ))}
          </select>
          {token0 && (
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
                {token0Info?.icon && <img src={token0Info.icon} alt={token0Info.symbol} />}
                <span>{token0Info?.symbol}</span>
              </div>
            </div>
          )}
        </div>

        <div className="input-group">
          <div className="input-label">
            <span>Token B</span>
            {token1 && (
              <span className="input-balance" onClick={() => handleMaxClick(1)}>
                Balance: {formatTokenAmount(balance1)}
              </span>
            )}
          </div>
          <select
            className="token-select"
            value={token1}
            onChange={(e) => setToken1(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Select token</option>
            {availableTokens.map((t) => (
              <option key={t.address} value={t.address} disabled={t.address === token0}>
                {t.symbol}
              </option>
            ))}
          </select>
          {token1 && (
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
                {token1Info?.icon && <img src={token1Info.icon} alt={token1Info.symbol} />}
                <span>{token1Info?.symbol}</span>
              </div>
            </div>
          )}
        </div>

        {/* Fee Tier Selection */}
        <div className="input-group">
          <div className="input-label">
            <span>Fee Tier</span>
          </div>
          <div className="fee-tier-buttons">
            {FEE_TIERS.map((tier) => (
              <button
                key={tier.fee}
                className={`fee-tier-btn ${feeTier === tier.fee ? 'active' : ''}`}
                onClick={() => setFeeTier(tier.fee)}
                disabled={isLoading}
              >
                {tier.label}
              </button>
            ))}
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
          disabled={isLoading || !token0 || !token1 || !amount0 || !amount1}
        >
          {isLoading ? 'Processing...' : status === 'success' ? 'Success!' : 'Create Pool'}
        </button>
      </div>
    </Modal>
  )
}
