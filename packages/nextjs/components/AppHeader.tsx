'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppState } from '@/store/AppContext'
import { formatArbmeMarketCap, formatUsd, formatPrice } from '@/utils/format'
import { buyArbme, sendTip } from '@/lib/actions'
import { ROUTES } from '@/utils/constants'

export function AppHeader() {
  const pathname = usePathname()
  const { state } = useAppState()
  const { globalStats } = state

  const marketCapDisplay = globalStats
    ? formatArbmeMarketCap(globalStats.arbmePrice)
    : '...'

  const tvlDisplay = globalStats
    ? formatUsd(globalStats.totalTvl)
    : '...'

  const priceDisplay = globalStats
    ? formatPrice(globalStats.arbmePrice)
    : '...'

  const navLinks = [
    { href: ROUTES.HOME, label: 'Pools' },
    { href: ROUTES.MY_POOLS, label: 'Positions' },
    { href: ROUTES.ADD_LIQUIDITY, label: '+ Add' },
  ]

  return (
    <header className="app-header">
      <div className="app-header-top">
        <div className="app-logo">
          <img src="/arbie.png" alt="ArbMe" className="logo-image" />
          <div>
            <h1>ArbMe</h1>
            <p className="text-secondary">Permissionless Arb Routes</p>
          </div>
        </div>
        <button
          onClick={() => sendTip('1')}
          className="tip-jar-button"
          title="Send 1 $ARBME tip"
        >
          💝
        </button>
      </div>

      <nav className="app-nav">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${pathname === link.href || (link.href !== ROUTES.HOME && pathname?.startsWith(link.href)) ? 'active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="stats-banner">
        <div className="stat-item">
          <span className="stat-label text-secondary">Market Cap</span>
          <span className="stat-value text-accent">{marketCapDisplay}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label text-secondary">Total TVL</span>
          <span className="stat-value">{tvlDisplay}</span>
        </div>
      </div>

      <div className="arbme-price-display">
        <span className="price-label text-secondary">$ARBME Price</span>
        <span className="price-value">{priceDisplay}</span>
        <button onClick={buyArbme} className="buy-arbme-btn">
          Buy $ARBME
        </button>
      </div>
    </header>
  )
}
