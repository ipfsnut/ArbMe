'use client'

import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { TokenLeaderboard } from '@/components/TokenLeaderboard'
import { ROUTES } from '@/utils/constants'

export default function TradeIndexPage() {
  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back" />

        <div className="page-header">
          <h1 style={{ fontFamily: 'var(--font-mono)' }}>Trade</h1>
          <p className="page-subtitle">$ARBME pools</p>
        </div>

        <TokenLeaderboard token="arbme" collapsible defaultOpen />
      </div>

      <Footer />
    </div>
  )
}
