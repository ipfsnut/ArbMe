'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, useAccount } from 'wagmi'
import { RainbowKitProvider, ConnectButton, darkTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import sdk from '@farcaster/miniapp-sdk'
import { wagmiConfig } from '@/config/wagmi'

const queryClient = new QueryClient()

// ═══════════════════════════════════════════════════════════════════════════════
// Wallet Context
// ═══════════════════════════════════════════════════════════════════════════════

interface WalletContextType {
  address: string | null
  isConnected: boolean
  isFarcaster: boolean
  isLoading: boolean
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  isFarcaster: false,
  isLoading: true,
})

export function useWalletContext() {
  return useContext(WalletContext)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Inner Wallet Logic (runs inside WagmiProvider)
// ═══════════════════════════════════════════════════════════════════════════════

function WalletInner({ children, isFarcaster }: { children: ReactNode; isFarcaster: boolean }) {
  const [farcasterAddress, setFarcasterAddress] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(isFarcaster)

  // Get wagmi account (used in browser mode)
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount()

  // Load Farcaster wallet if in Farcaster mode
  useEffect(() => {
    if (!isFarcaster) return

    async function loadFarcasterWallet() {
      try {
        console.log('[Wallet] Loading Farcaster wallet...')
        sdk.actions.ready()

        const provider = await sdk.wallet.getEthereumProvider()
        if (!provider) {
          console.log('[Wallet] No Farcaster provider')
          setIsLoading(false)
          return
        }

        const accounts = await provider.request({
          method: 'eth_accounts'
        }) as string[]

        if (accounts && accounts.length > 0) {
          console.log('[Wallet] Farcaster wallet:', accounts[0])
          setFarcasterAddress(accounts[0])
        }
      } catch (error) {
        console.error('[Wallet] Farcaster error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadFarcasterWallet()
  }, [isFarcaster])

  // Determine which address to use
  const address = isFarcaster ? farcasterAddress : (wagmiAddress || null)
  const isConnected = isFarcaster ? !!farcasterAddress : wagmiConnected

  return (
    <WalletContext.Provider value={{
      address,
      isConnected,
      isFarcaster,
      isLoading,
    }}>
      {children}
    </WalletContext.Provider>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Wallet Provider
// Always wraps in WagmiProvider so wagmi hooks work everywhere
// ═══════════════════════════════════════════════════════════════════════════════

interface WalletProviderProps {
  children: ReactNode
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [isFarcaster, setIsFarcaster] = useState<boolean | null>(null)

  useEffect(() => {
    const detectEnvironment = async () => {
      try {
        // Check if we're in an iframe (Farcaster frames run in iframes)
        const inIframe = typeof window !== 'undefined' && window.parent !== window

        if (inIframe) {
          // Try to get the Farcaster provider with a timeout
          // The SDK can hang on mobile browsers outside of Warpcast
          const providerPromise = sdk.wallet.getEthereumProvider()
          const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), 2000) // 2 second timeout
          })

          const provider = await Promise.race([providerPromise, timeoutPromise])
          if (provider) {
            console.log('[WalletProvider] Farcaster environment detected')
            setIsFarcaster(true)
            return
          }
        }

        console.log('[WalletProvider] Browser environment detected')
        setIsFarcaster(false)
      } catch (error) {
        console.log('[WalletProvider] Defaulting to browser mode')
        setIsFarcaster(false)
      }
    }

    detectEnvironment()
  }, [])

  // Still detecting environment
  if (isFarcaster === null) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0a0a0a',
        color: '#666',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '8px' }}>Loading...</div>
        </div>
      </div>
    )
  }

  // Always wrap in WagmiProvider so wagmi hooks work in both environments
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#00d395',
            accentColorForeground: 'black',
            borderRadius: 'medium',
          })}
        >
          <WalletInner isFarcaster={isFarcaster}>
            {children}
          </WalletInner>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Connect Button Component
// ═══════════════════════════════════════════════════════════════════════════════

export function WalletConnectButton() {
  const { isFarcaster, address, isConnected } = useWalletContext()

  // In Farcaster, wallet is auto-connected, just show address
  if (isFarcaster) {
    if (!address) {
      return (
        <div className="wallet-status">
          <span className="wallet-loading">Connecting...</span>
        </div>
      )
    }
    return (
      <div className="wallet-status">
        <span className="wallet-address">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
      </div>
    )
  }

  // In browser, show RainbowKit connect button
  return <ConnectButton />
}
