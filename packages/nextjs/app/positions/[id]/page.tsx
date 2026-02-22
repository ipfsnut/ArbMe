'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWallet, useIsFarcaster, useIsSafe } from '@/hooks/useWallet'
import { usePositions } from '@/hooks/usePositions'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { ROUTES } from '@/utils/constants'
import type { Position } from '@/utils/types'
import { useSendTransaction } from 'wagmi'

const API_BASE = '/api'

type TxStatus = 'idle' | 'building' | 'pending' | 'success' | 'error'

export default function PositionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const wallet = useWallet()
  const isFarcaster = useIsFarcaster()
  const isSafe = useIsSafe()
  const { sendTransactionAsync } = useSendTransaction()
  const positionId = params.id as string

  const { positions, loading, error, invalidate } = usePositions(wallet)
  const position = useMemo(
    () => positions.find(p => p.id === positionId) ?? null,
    [positions, positionId],
  )

  // Transaction states
  const [collectStatus, setCollectStatus] = useState<TxStatus>('idle')
  const [removePercentage, setRemovePercentage] = useState(0)
  const [removeStatus, setRemoveStatus] = useState<TxStatus>('idle')
  const [transferStatus, setTransferStatus] = useState<TxStatus>('idle')
  const [txError, setTxError] = useState<string | null>(null)

  // Modal states
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [recipientAddress, setRecipientAddress] = useState('')

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

  const handleCollectFees = async () => {
    if (!position || !wallet) return

    try {
      setCollectStatus('building')
      setTxError(null)

      const res = await fetch(`${API_BASE}/collect-fees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: position.id,
          recipient: wallet,
          // V4 needs token addresses for the TAKE_PAIR action
          currency0: position.token0?.address,
          currency1: position.token1?.address,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to build transaction')
      }

      const { transaction } = await res.json()

      setCollectStatus('pending')
      await sendTransaction(transaction)
      setCollectStatus('success')

      // Invalidate cache and refresh position data
      setTimeout(async () => {
        await invalidate()
        setCollectStatus('idle')
      }, 3000)
    } catch (err: any) {
      console.error('[collectFees] Error:', err)
      setTxError(err.message || 'Transaction failed')
      setCollectStatus('error')
    }
  }

  const handleRemoveLiquidity = async () => {
    if (!position || !wallet || removePercentage === 0) return

    try {
      setRemoveStatus('building')
      setTxError(null)

      const res = await fetch(`${API_BASE}/decrease-liquidity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: position.id,
          liquidityPercentage: removePercentage,
          currentLiquidity: position.liquidity,
          recipient: wallet,
          // V4 needs token addresses for TAKE_PAIR action
          currency0: position.token0?.address,
          currency1: position.token1?.address,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to build transaction')
      }

      const { transaction } = await res.json()

      setRemoveStatus('pending')
      await sendTransaction(transaction)
      setRemoveStatus('success')

      // Invalidate cache, refresh, and close modal
      setTimeout(async () => {
        await invalidate()
        setRemoveStatus('idle')
        setShowRemoveModal(false)
        setRemovePercentage(0)

        // If 100% removed, go back to list
        if (removePercentage === 100) {
          router.push(ROUTES.MY_POOLS)
        }
      }, 3000)
    } catch (err: any) {
      console.error('[removeLiquidity] Error:', err)
      setTxError(err.message || 'Transaction failed')
      setRemoveStatus('error')
    }
  }

  const handleTransferPosition = async () => {
    if (!position || !wallet || !recipientAddress) return

    try {
      setTransferStatus('building')
      setTxError(null)

      // Parse version and tokenId from position id (e.g. "v3-12345")
      const [versionStr, tokenIdStr] = position.id.split('-')
      const version = versionStr.toUpperCase() as 'V3' | 'V4'

      const res = await fetch(`${API_BASE}/transfer-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: wallet,
          to: recipientAddress,
          tokenId: tokenIdStr,
          version,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to build transaction')
      }

      const { transaction } = await res.json()

      setTransferStatus('pending')
      await sendTransaction(transaction)
      setTransferStatus('success')

      // Invalidate cache and redirect to positions list
      setTimeout(async () => {
        await invalidate()
        router.push(ROUTES.MY_POOLS)
      }, 3000)
    } catch (err: any) {
      console.error('[transferPosition] Error:', err)
      setTxError(err.message || 'Transaction failed')
      setTransferStatus('error')
    }
  }

  const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr)

  const formatUsd = (value: number | undefined) => {
    if (value === undefined || value === null) return '$0.00'
    if (value < 0.01) return '<$0.01'
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatAmount = (amount: number | undefined, decimals: number = 4) => {
    if (amount === undefined || amount === null) return '0'
    if (amount < 0.0001) return '<0.0001'
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
    if (amount >= 100_000) return `${(amount / 1_000).toFixed(1)}K`
    if (amount >= 1_000) return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })
  }

  const isClosed = position && (!position.liquidityUsd || position.liquidityUsd === 0)
  const hasFees = position && position.feesEarnedUsd && position.feesEarnedUsd > 0

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.MY_POOLS} label="Back to Positions" />

        {!wallet ? (
          <div className="empty-state">
            <p>Connect your wallet to view this position</p>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading position...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={() => router.push(ROUTES.MY_POOLS)}>Back to Positions</button>
          </div>
        ) : !position ? (
          <div className="empty-state">
            <p>Position not found</p>
            <button onClick={() => router.push(ROUTES.MY_POOLS)}>Back to Positions</button>
          </div>
        ) : (
          <div className="position-detail-card">
            <div className="detail-header">
              <div>
                <h2 style={{ margin: 0 }}>{position.pair}</h2>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <span className={`version-badge ${position.version.toLowerCase()}`}>
                    {position.version}
                  </span>
                  {position.fee && (
                    <span className="fee-badge">{(position.fee / 10000).toFixed(2)}% fee</span>
                  )}
                  {position.version !== 'V2' && position.inRange !== undefined && (
                    <span className={`range-badge ${position.inRange ? 'in-range' : 'out-of-range'}`}>
                      {position.inRange ? 'In Range' : 'Out of Range'}
                    </span>
                  )}
                </div>
              </div>
              <div className="position-value">
                {formatUsd(position.liquidityUsd)}
              </div>
            </div>

            {/* Token Amounts */}
            <div className="detail-section">
              <h3>Token Amounts</h3>
              <div className="detail-stats">
                <div className="stat-large">
                  <span className="stat-label">{position.token0?.symbol || '???'}</span>
                  <span className="stat-value">{formatAmount(position.token0?.amount)}</span>
                </div>
                <div className="stat-large">
                  <span className="stat-label">{position.token1?.symbol || '???'}</span>
                  <span className="stat-value">{formatAmount(position.token1?.amount)}</span>
                </div>
              </div>
            </div>

            {/* Unclaimed Fees */}
            {hasFees && !isClosed && (
              <div className="detail-section">
                <h3>Unclaimed Fees</h3>
                <div className="unclaimed-fees" style={{ marginTop: 0 }}>
                  <span className="fees-label">Available to collect</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                    {formatUsd(position.feesEarnedUsd)}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            {!isClosed && (
              <div className="detail-actions">
                {hasFees && position.version !== 'V2' && (
                  <button
                    className="btn btn-primary full-width"
                    onClick={handleCollectFees}
                    disabled={collectStatus !== 'idle'}
                  >
                    {collectStatus === 'building' && 'Building...'}
                    {collectStatus === 'pending' && (
                      <>
                        <span className="loading-spinner small" /> Collecting...
                      </>
                    )}
                    {collectStatus === 'success' && (isSafe ? 'Proposed to Safe' : 'Collected!')}
                    {collectStatus === 'error' && 'Failed - Try Again'}
                    {collectStatus === 'idle' && 'Collect Fees'}
                  </button>
                )}

                <button
                  className="btn btn-secondary full-width"
                  onClick={() => setShowRemoveModal(true)}
                >
                  Remove Liquidity
                </button>

                <Link
                  href={`${ROUTES.ADD_LIQUIDITY}?pool=${position.poolAddress}&version=${position.version}&token0=${position.token0?.address || ''}&token1=${position.token1?.address || ''}&fee=${position.fee || ''}`}
                  className="btn btn-secondary full-width"
                  style={{ textAlign: 'center' }}
                >
                  Add More Liquidity
                </Link>

                {position.version !== 'V2' && (
                  <button
                    className="btn btn-secondary full-width"
                    onClick={() => setShowSendModal(true)}
                  >
                    Send Position
                  </button>
                )}
              </div>
            )}

            {isClosed && (
              <div className="info-message" style={{ marginTop: '1rem' }}>
                This position has been closed. No further actions available.
              </div>
            )}

            {txError && (
              <div className="tx-error" style={{ marginTop: '1rem' }}>
                {txError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Remove Liquidity Modal */}
      {showRemoveModal && position && (
        <div className="modal-overlay visible">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Remove Liquidity</span>
              <button
                className="modal-close"
                onClick={() => {
                  setShowRemoveModal(false)
                  setRemovePercentage(0)
                  setRemoveStatus('idle')
                  setTxError(null)
                }}
                disabled={removeStatus === 'pending'}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="remove-liquidity-form">
                <div className="input-group">
                  <span className="input-label">Amount to Remove</span>
                  <div className="percentage-display">{removePercentage}%</div>
                  <input
                    type="range"
                    className="percentage-slider"
                    min="0"
                    max="100"
                    step="1"
                    value={removePercentage}
                    onChange={(e) => setRemovePercentage(Number(e.target.value))}
                    disabled={removeStatus === 'pending'}
                  />
                  <div className="percentage-buttons">
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setRemovePercentage(pct)}
                        disabled={removeStatus === 'pending'}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="remove-preview">
                  <div className="preview-header">You will receive</div>
                  <div className="preview-amounts">
                    <div className="preview-row">
                      <span className="token-symbol">{position.token0?.symbol || '???'}</span>
                      <span className="amount">
                        {formatAmount((position.token0?.amount || 0) * (removePercentage / 100))}
                      </span>
                    </div>
                    <div className="preview-row">
                      <span className="token-symbol">{position.token1?.symbol || '???'}</span>
                      <span className="amount">
                        {formatAmount((position.token1?.amount || 0) * (removePercentage / 100))}
                      </span>
                    </div>
                  </div>
                  {hasFees && position.version !== 'V2' && (
                    <div className="fees-note">
                      Unclaimed fees will also be collected
                    </div>
                  )}
                </div>

                {txError && (
                  <div className="tx-error">{txError}</div>
                )}

                <button
                  className="btn btn-primary full-width"
                  onClick={handleRemoveLiquidity}
                  disabled={removePercentage === 0 || removeStatus === 'pending' || removeStatus === 'building'}
                >
                  {removeStatus === 'building' && 'Building...'}
                  {removeStatus === 'pending' && (
                    <>
                      <span className="loading-spinner small" /> Removing...
                    </>
                  )}
                  {removeStatus === 'success' && (isSafe ? 'Proposed to Safe' : 'Success!')}
                  {removeStatus === 'error' && 'Failed - Try Again'}
                  {removeStatus === 'idle' && (
                    removePercentage === 100 ? 'Remove All & Close Position' : `Remove ${removePercentage}%`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Position Modal */}
      {showSendModal && position && (
        <div className="modal-overlay visible">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Send Position</span>
              <button
                className="modal-close"
                onClick={() => {
                  setShowSendModal(false)
                  setRecipientAddress('')
                  setTransferStatus('idle')
                  setTxError(null)
                }}
                disabled={transferStatus === 'pending'}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="remove-liquidity-form">
                <p style={{ margin: '0 0 0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Transfer this {position.pair} {position.version} position NFT to another address. This is irreversible.
                </p>

                <div className="input-group">
                  <span className="input-label">Recipient Address</span>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="0x..."
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value.trim())}
                    disabled={transferStatus === 'pending' || transferStatus === 'building'}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      fontFamily: 'monospace',
                    }}
                  />
                  {recipientAddress && !isValidAddress(recipientAddress) && (
                    <span style={{ color: 'var(--error)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      Enter a valid Ethereum address
                    </span>
                  )}
                  {recipientAddress.toLowerCase() === wallet?.toLowerCase() && (
                    <span style={{ color: 'var(--warning, #f59e0b)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      This is your own address
                    </span>
                  )}
                </div>

                {txError && (
                  <div className="tx-error">{txError}</div>
                )}

                <button
                  className="btn btn-primary full-width"
                  onClick={handleTransferPosition}
                  disabled={!isValidAddress(recipientAddress) || transferStatus === 'pending' || transferStatus === 'building'}
                >
                  {transferStatus === 'building' && 'Building...'}
                  {transferStatus === 'pending' && (
                    <>
                      <span className="loading-spinner small" /> Sending...
                    </>
                  )}
                  {transferStatus === 'success' && (isSafe ? 'Proposed to Safe' : 'Sent!')}
                  {transferStatus === 'error' && 'Failed - Try Again'}
                  {transferStatus === 'idle' && 'Confirm Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
