import { useState, useCallback } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, useConnect } from 'wagmi'
import { config } from './lib/wagmi'
import { Header } from './components/Header'
import { PositionCard } from './components/PositionCard'
import { PoolList } from './components/PoolList'
import { AddLiquidityModal } from './components/AddLiquidityModal'
import { RemoveLiquidityModal } from './components/RemoveLiquidityModal'
import { CreatePoolModal } from './components/CreatePoolModal'
import { useFarcaster } from './hooks/useFarcaster'
import { useActivePositions } from './hooks/usePositions'
import type { Position, PoolData } from './lib/api'
import './styles/index.css'

const queryClient = new QueryClient()

function PositionsList({
  onAddLiquidity,
  onRemoveLiquidity,
}: {
  onAddLiquidity: (position: Position) => void
  onRemoveLiquidity: (position: Position) => void
}) {
  const { address } = useFarcaster()
  const { activePositions, closedPositions, isLoading, error, refetch } = useActivePositions(address)
  const [showClosed, setShowClosed] = useState(false)

  if (!address) {
    return (
      <section className="positions-section">
        <div className="section-header">
          <h2>Your Positions</h2>
        </div>
        <div className="empty-state">
          <p>Connect your wallet to view positions</p>
        </div>
      </section>
    )
  }

  if (isLoading) {
    return (
      <section className="positions-section">
        <div className="section-header">
          <h2>Your Positions</h2>
        </div>
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>Loading positions...</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="positions-section">
        <div className="section-header">
          <h2>Your Positions</h2>
        </div>
        <div className="error-state">
          <p>Failed to load positions</p>
          <button onClick={() => refetch()}>Retry</button>
        </div>
      </section>
    )
  }

  const displayPositions = showClosed
    ? [...activePositions, ...closedPositions]
    : activePositions

  return (
    <section className="positions-section">
      <div className="section-header">
        <h2>
          Your Positions
          <span className="count">({activePositions.length} active)</span>
          {closedPositions.length > 0 && (
            <span className="closed-count">+{closedPositions.length} closed</span>
          )}
        </h2>
        <button className="refresh-btn" onClick={() => refetch()}>
          Refresh
        </button>
      </div>

      {closedPositions.length > 0 && (
        <div className="positions-filter">
          <label className="filter-toggle">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
            />
            <span className="filter-label">Show closed positions</span>
          </label>
        </div>
      )}

      {displayPositions.length === 0 ? (
        <div className="empty-state">
          <p>No positions found</p>
          <p className="hint">Add liquidity to a pool to get started</p>
        </div>
      ) : (
        <div className="positions-grid">
          {displayPositions.map((pos, idx) => (
            <PositionCard
              key={`${pos.type}-${pos.type === 'V2' ? pos.poolAddress : 'tokenId' in pos ? pos.tokenId : idx}-${idx}`}
              position={pos}
              onAddLiquidity={onAddLiquidity}
              onRemoveLiquidity={onRemoveLiquidity}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function AppContent() {
  const { connectors, connect } = useConnect()
  useFarcaster() // Initialize Farcaster context

  // Modal states
  const [addLiquidityPool, setAddLiquidityPool] = useState<PoolData | null>(null)
  const [addLiquidityPosition, setAddLiquidityPosition] = useState<Position | null>(null)
  const [removeLiquidityPosition, setRemoveLiquidityPosition] = useState<Position | null>(null)
  const [isCreatePoolOpen, setIsCreatePoolOpen] = useState(false)

  const handleConnectWallet = () => {
    const coinbaseConnector = connectors.find(c => c.name === 'Coinbase Wallet')
    if (coinbaseConnector) {
      connect({ connector: coinbaseConnector })
    }
  }

  const handleAddToPool = useCallback((pool: PoolData) => {
    setAddLiquidityPool(pool)
    setAddLiquidityPosition(null)
  }, [])

  const handleAddToPosition = useCallback((position: Position) => {
    setAddLiquidityPosition(position)
    setAddLiquidityPool(null)
  }, [])

  const handleRemoveFromPosition = useCallback((position: Position) => {
    setRemoveLiquidityPosition(position)
  }, [])

  const handleModalClose = useCallback(() => {
    setAddLiquidityPool(null)
    setAddLiquidityPosition(null)
    setRemoveLiquidityPosition(null)
    setIsCreatePoolOpen(false)
  }, [])

  const handleOpenCreatePool = useCallback(() => {
    setIsCreatePoolOpen(true)
  }, [])

  const handleSuccess = useCallback(() => {
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['positions'] })
    queryClient.invalidateQueries({ queryKey: ['pools'] })
  }, [])

  return (
    <div className="app">
      <Header onConnectWallet={handleConnectWallet} />

      <main className="main-content">
        {/* Positions Section */}
        <PositionsList
          onAddLiquidity={handleAddToPosition}
          onRemoveLiquidity={handleRemoveFromPosition}
        />

        {/* Pools Section */}
        <PoolList onAddLiquidity={handleAddToPool} onCreatePool={handleOpenCreatePool} />
      </main>

      <footer className="footer">
        <p>
          Made with love by{' '}
          <a href="https://warpcast.com/arbme" target="_blank" rel="noopener noreferrer">
            @arbme
          </a>
        </p>
      </footer>

      {/* Modals */}
      <AddLiquidityModal
        isOpen={!!(addLiquidityPool || addLiquidityPosition)}
        onClose={handleModalClose}
        pool={addLiquidityPool}
        position={addLiquidityPosition}
        onSuccess={handleSuccess}
      />

      <RemoveLiquidityModal
        isOpen={!!removeLiquidityPosition}
        onClose={handleModalClose}
        position={removeLiquidityPosition}
        onSuccess={handleSuccess}
      />

      <CreatePoolModal
        isOpen={isCreatePoolOpen}
        onClose={handleModalClose}
        onSuccess={handleSuccess}
      />
    </div>
  )
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
