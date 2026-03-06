'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppState } from '@/store/AppContext'
import { WalletConnectButton } from '@/components/WalletProvider'
import { formatPrice } from '@/utils/format'
import { ROUTES } from '@/utils/constants'
import { fetchTokenPricesOnly } from '@/services/api'

export function AppHeader() {
  const pathname = usePathname()
  const { state, setState } = useAppState()
  const { globalStats } = state

  // Fetch prices from lightweight endpoint (no full pool data)
  useEffect(() => {
    if (globalStats) return
    fetchTokenPricesOnly()
      .then((data) => {
        setState({
          globalStats: {
            arbmePrice: data.arbmePrice,
            chaosPrice: data.chaosPrice,
            ratchetPrice: data.ratchetPrice,
            totalTvl: data.totalTvl,
            arbmeTvl: data.arbmeTvl,
            chaosTvl: data.chaosTvl,
            ratchetTvl: data.ratchetTvl,
            // Legacy fields
            abcPrice: '0',
            clawdPrice: '0',
            abcTvl: 0,
            clawdTvl: 0,
          },
          loading: false,
        })
      })
      .catch((err) => {
        console.error('[AppHeader] Failed to fetch prices:', err)
      })
  }, [globalStats])

  const arbmePriceDisplay = globalStats ? formatPrice(globalStats.arbmePrice) : '...'
  const chaosPriceDisplay = globalStats ? formatPrice(globalStats.chaosPrice) : '...'
  const ratchetPriceDisplay = globalStats ? formatPrice(globalStats.ratchetPrice) : '...'

  const primaryNav = [
    { href: ROUTES.TRADE, label: 'Trade' },
    { href: ROUTES.ADVANCED, label: 'Advanced' },
    { href: ROUTES.BUILD, label: 'Build' },
  ]

  const secondaryNav = [
    { href: ROUTES.MY_POOLS, label: 'Positions' },
    { href: ROUTES.ADD_LIQUIDITY, label: '+ Add' },
    { href: ROUTES.TRAFFIC, label: 'Traffic' },
    { href: ROUTES.TREASURY, label: 'Treasury' },
    { href: '/blog', label: 'Blog' },
  ]

  const isActive = (href: string) =>
    pathname === href || (href !== ROUTES.HOME && pathname?.startsWith(href))

  return (
    <header className="app-header">
      <div className="app-header-top">
        <div className="app-logo">
          <Link href={ROUTES.HOME}>
            <img src="/arbie.png" alt="ArbMe" className="logo-image" />
          </Link>
          <div>
            <Link href={ROUTES.HOME} style={{ textDecoration: 'none', color: 'inherit' }}>
              <h1>ArbMe</h1>
            </Link>
            <p className="text-secondary">Permissionless Arb Routes</p>
          </div>
        </div>
        <div className="header-actions">
          <WalletConnectButton />
        </div>
      </div>

      <nav className="app-nav">
        {primaryNav.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${isActive(link.href) ? 'active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <nav className="app-nav app-nav-secondary">
        {secondaryNav.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${isActive(link.href) ? 'active' : ''}`}
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
          <span className="stat-label text-secondary">$CHAOSLP</span>
          <span className="stat-value">{chaosPriceDisplay}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label text-secondary">$RATCHET</span>
          <span className="stat-value">{ratchetPriceDisplay}</span>
        </div>
      </div>
    </header>
  )
}
