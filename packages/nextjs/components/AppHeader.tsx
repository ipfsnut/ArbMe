'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppState } from '@/store/AppContext'
import { WalletConnectButton } from '@/components/WalletProvider'
import { formatUsd, formatPrice } from '@/utils/format'
import { sendTip } from '@/lib/actions'
import { ROUTES } from '@/utils/constants'
import { fetchPools } from '@/services/api'

export function AppHeader() {
  const pathname = usePathname()
  const { state, setState } = useAppState()
  const { globalStats } = state

  // Fetch prices if not already loaded (e.g. user navigated directly to a non-home page)
  useEffect(() => {
    if (globalStats) return
    fetchPools()
      .then((data) => {
        setState({
          pools: data.pools,
          globalStats: {
            arbmePrice: data.arbmePrice,
            ratchetPrice: data.ratchetPrice,
            abcPrice: data.abcPrice,
            clawdPrice: data.clawdPrice,
            totalTvl: data.totalTvl,
            arbmeTvl: data.arbmeTvl,
            ratchetTvl: data.ratchetTvl,
            abcTvl: data.abcTvl,
            clawdTvl: data.clawdTvl,
          },
          loading: false,
        })
      })
      .catch((err) => {
        console.error('[AppHeader] Failed to fetch prices:', err)
      })
  }, [globalStats])

  const arbmePriceDisplay = globalStats ? formatPrice(globalStats.arbmePrice) : '...'
  const ratchetPriceDisplay = globalStats ? formatPrice(globalStats.ratchetPrice) : '...'
  const abcPriceDisplay = globalStats ? formatPrice(globalStats.abcPrice) : '...'

  const tvlDisplay = globalStats
    ? formatUsd(globalStats.totalTvl)
    : '...'

  const navLinks = [
    { href: ROUTES.HOME, label: 'Home' },
    { href: ROUTES.MY_POOLS, label: 'Positions' },
    { href: ROUTES.STAKE, label: 'Stake $RATCHET', small: true },
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
        <div className="header-actions">
          <WalletConnectButton />
          <button
            onClick={() => sendTip('1')}
            className="tip-jar-button"
            title="Send 1 $ARBME tip"
          >
            Tip the Dev
          </button>
        </div>
      </div>

      <nav className="app-nav">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${pathname === link.href || (link.href !== ROUTES.HOME && pathname?.startsWith(link.href)) ? 'active' : ''} ${link.small ? 'nav-link-sm' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="stats-banner">
        <div className="stat-item">
          <span className="stat-label text-secondary">$ARBME</span>
          <span className="stat-value text-accent">{arbmePriceDisplay}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label text-secondary">$RATCHET</span>
          <span className="stat-value">{ratchetPriceDisplay}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label text-secondary">$ABC</span>
          <span className="stat-value">{abcPriceDisplay}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label text-secondary">TVL</span>
          <span className="stat-value">{tvlDisplay}</span>
        </div>
      </div>
    </header>
  )
}
