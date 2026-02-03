'use client'

import { useEffect, useState } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'

// ABCDAO Multisig
const MULTISIG_ADDRESS = '0xc35c2dCdD084F1Df8a4dDbD374436E35136b4368'

// Known token addresses on Base
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07': { symbol: 'ARBME', decimals: 18 },
  '0x768be13e1680b5ebe0024c42c896e3db59ec0149': { symbol: 'RATCHET', decimals: 18 },
  '0x60c39541540e49a18e4c591c74b3487b4cd2aa27': { symbol: 'ABC', decimals: 18 },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', decimals: 18 },
}

interface TokenBalance {
  address: string
  symbol: string
  balance: string
  balanceFormatted: number
  priceUsd: number
  valueUsd: number
}

export default function TreasuryPage() {
  const [ethBalance, setEthBalance] = useState<string | null>(null)
  const [ethValueUsd, setEthValueUsd] = useState<number>(0)
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchBalances = async () => {
    setLoading(true)
    setError(null)

    try {
      const rpcUrl = 'https://mainnet.base.org'

      // Fetch ETH balance
      const ethResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBalance',
          params: [MULTISIG_ADDRESS, 'latest'],
        }),
      })

      const ethData = await ethResponse.json()
      let ethBalanceNum = 0
      if (ethData.result) {
        const ethWei = BigInt(ethData.result)
        ethBalanceNum = Number(ethWei) / 1e18
        setEthBalance(ethBalanceNum.toFixed(4))
      }

      // Fetch token balances via balanceOf for all known tokens
      const balancesRaw: Array<{ address: string; symbol: string; decimals: number; balanceFormatted: number }> = []

      for (const [address, token] of Object.entries(KNOWN_TOKENS)) {
        try {
          // balanceOf(address) selector = 0x70a08231
          const data = `0x70a08231000000000000000000000000${MULTISIG_ADDRESS.slice(2)}`

          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_call',
              params: [{ to: address, data }, 'latest'],
            }),
          })

          const result = await response.json()

          if (result.result && result.result !== '0x' && result.result !== '0x0') {
            const balanceWei = BigInt(result.result)
            const balanceFormatted = Number(balanceWei) / Math.pow(10, token.decimals)

            if (balanceFormatted > 0) {
              balancesRaw.push({
                address,
                symbol: token.symbol,
                decimals: token.decimals,
                balanceFormatted,
              })
            }
          }
        } catch (err) {
          console.error(`Failed to fetch ${token.symbol} balance:`, err)
        }
      }

      // Fetch prices for all tokens (+ WETH for ETH pricing) using our own API
      const tokenAddresses = balancesRaw.map(t => t.address)
      const wethAddress = '0x4200000000000000000000000000000000000006'
      if (!tokenAddresses.includes(wethAddress)) {
        tokenAddresses.push(wethAddress)
      }

      let prices: Record<string, number> = {}
      try {
        const priceResponse = await fetch(`/api/token-price?addresses=${tokenAddresses.join(',')}`)
        const priceData = await priceResponse.json()
        prices = priceData.prices || {}
      } catch (err) {
        console.error('[Treasury] Error fetching prices:', err)
      }

      // Calculate ETH USD value
      const wethPrice = prices[wethAddress.toLowerCase()] || prices[wethAddress] || 0
      const ethUsdValue = ethBalanceNum * wethPrice
      setEthValueUsd(ethUsdValue)

      // Build token balances with USD values
      const balances: TokenBalance[] = balancesRaw.map(t => {
        const priceUsd = prices[t.address.toLowerCase()] || prices[t.address] || 0
        const valueUsd = t.balanceFormatted * priceUsd
        return {
          address: t.address,
          symbol: t.symbol,
          balance: '',
          balanceFormatted: t.balanceFormatted,
          priceUsd,
          valueUsd,
        }
      })

      // Sort by USD value descending
      balances.sort((a, b) => b.valueUsd - a.valueUsd)

      setTokenBalances(balances)
      setLastUpdated(new Date())
    } catch (err: any) {
      console.error('[Treasury] Error fetching balances:', err)
      setError(err.message || 'Failed to fetch balances')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBalances()
  }, [])

  const formatBalance = (value: number): string => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
    if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
    if (value >= 0.0001) return value.toFixed(6)
    return value.toFixed(8)
  }

  const formatUsd = (value: number): string => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
    if (value >= 1) return `$${value.toFixed(2)}`
    if (value >= 0.01) return `$${value.toFixed(2)}`
    return `$${value.toFixed(4)}`
  }

  const formatPrice = (value: number): string => {
    if (value >= 1) return `$${value.toFixed(2)}`
    if (value >= 0.01) return `$${value.toFixed(4)}`
    if (value >= 0.0001) return `$${value.toFixed(6)}`
    return `$${value.toFixed(8)}`
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href="/" label="Back" />

        <div className="page-header">
          <h1 style={{ fontFamily: 'var(--font-mono)' }}>ABC_DAO_Treasury</h1>
          <p className="page-subtitle">Live balances from the multisig</p>
        </div>

        {/* Multisig Address */}
        <div className="treasury-address-card">
          <div className="treasury-label">Multisig Address</div>
          <a
            href={`https://basescan.org/address/${MULTISIG_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="treasury-address"
          >
            {MULTISIG_ADDRESS}
          </a>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Fetching balances...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={fetchBalances}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Top 5 Assets by Value */}
            <div className="treasury-section">
              <h2 className="section-title">Top Assets by Value</h2>
              <div className="treasury-tokens-list">
                {/* Include ETH in the ranking */}
                {(() => {
                  const ethAsset = {
                    address: 'native',
                    symbol: 'ETH',
                    balanceFormatted: parseFloat(ethBalance || '0'),
                    priceUsd: ethValueUsd / (parseFloat(ethBalance || '0') || 1),
                    valueUsd: ethValueUsd,
                  }
                  const allAssets = [ethAsset, ...tokenBalances]
                    .sort((a, b) => b.valueUsd - a.valueUsd)
                    .slice(0, 5)

                  const totalValue = allAssets.reduce((sum, a) => sum + a.valueUsd, 0)

                  return (
                    <>
                      <div className="treasury-total-card">
                        <div className="treasury-total-label">Total Value (Top 5)</div>
                        <div className="treasury-total-value">{formatUsd(totalValue)}</div>
                      </div>
                      {allAssets.map((asset) => (
                        <div key={asset.address} className="treasury-balance-card">
                          <div className="treasury-token-info">
                            <div className="treasury-token-symbol">{asset.symbol}</div>
                            {asset.address !== 'native' && (
                              <a
                                href={`https://basescan.org/token/${asset.address}?a=${MULTISIG_ADDRESS}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="treasury-token-link"
                              >
                                View on Basescan
                              </a>
                            )}
                            {asset.address === 'native' && (
                              <a
                                href={`https://basescan.org/address/${MULTISIG_ADDRESS}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="treasury-token-link"
                              >
                                View on Basescan
                              </a>
                            )}
                          </div>
                          <div className="treasury-token-values">
                            <div className="treasury-token-balance">
                              {formatBalance(asset.balanceFormatted)} {asset.symbol}
                            </div>
                            <div className="treasury-token-usd">
                              {formatUsd(asset.valueUsd)}
                              {asset.priceUsd > 0 && (
                                <span className="treasury-token-price">
                                  @ {formatPrice(asset.priceUsd)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )
                })()}
              </div>
            </div>

            {tokenBalances.length === 0 && !ethBalance && (
              <div className="treasury-section">
                <p className="text-muted">No balances found</p>
              </div>
            )}

            {/* Refresh Button & Last Updated */}
            <div className="treasury-footer">
              <button className="btn btn-secondary" onClick={fetchBalances}>
                Refresh
              </button>
              {lastUpdated && (
                <span className="treasury-updated">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  )
}
