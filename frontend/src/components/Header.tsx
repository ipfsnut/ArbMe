import { useFarcaster } from '../hooks/useFarcaster'

interface HeaderProps {
  onConnectWallet?: () => void
}

export function Header({ onConnectWallet }: HeaderProps) {
  const { address, isInFarcaster, connectWallet } = useFarcaster()

  const handleConnect = async () => {
    if (isInFarcaster) {
      await connectWallet()
    } else {
      onConnectWallet?.()
    }
  }

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <img src="https://arbme.epicdylan.com/arbie.png" alt="ArbMe" className="logo-img" />
          <span className="logo-text">$ARBME</span>
        </div>

        <button
          className={`wallet-btn ${address ? 'connected' : ''}`}
          onClick={handleConnect}
        >
          {address ? (
            <>
              <span className="wallet-dot" />
              <span>{formatAddress(address)}</span>
            </>
          ) : (
            <span>Connect</span>
          )}
        </button>
      </div>
    </header>
  )
}
