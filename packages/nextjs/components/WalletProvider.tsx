'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, useAccount } from 'wagmi'
import { RainbowKitProvider, ConnectButton, darkTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { wagmiConfig } from '@/config/wagmi'

const queryClient = new QueryClient()

// ═══════════════════════════════════════════════════════════════════════════════
// Wallet Context
// ═══════════════════════════════════════════════════════════════════════════════

interface WalletContextType {
  address: string | null
  isConnected: boolean
  isFarcaster: boolean
  isSafe: boolean
  isLoading: boolean
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  isFarcaster: false,
  isSafe: false,
  isLoading: true,
})

export function useWalletContext() {
  return useContext(WalletContext)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Inner Wallet Logic (runs inside WagmiProvider)
// ═══════════════════════════════════════════════════════════════════════════════

function WalletInner({ children, isFarcaster, isSafe }: { children: ReactNode; isFarcaster: boolean; isSafe: boolean }) {
  const [farcasterAddress, setFarcasterAddress] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(isFarcaster)

  // Get wagmi account (used in browser mode)
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount()

  // Load Farcaster wallet if in Farcaster mode (dynamic import)
  useEffect(() => {
    if (!isFarcaster) return

    async function loadFarcasterWallet() {
      try {
        console.log('[Wallet] Loading Farcaster wallet...')
        const sdk = (await import('@farcaster/miniapp-sdk')).default

        // Signal ready
        try {
          sdk.actions.ready()
          console.log('[Wallet] Signaled ready to Farcaster')
        } catch (e) {
          console.log('[Wallet] Could not signal ready:', e)
        }

        // Add timeout to provider request
        const providerPromise = sdk.wallet.getEthereumProvider()
        const timeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 3000)
        })

        const provider = await Promise.race([providerPromise, timeoutPromise])
        if (!provider) {
          console.log('[Wallet] No Farcaster provider (timeout)')
          setIsLoading(false)
          return
        }

        // Switch to Base (chain ID 8453 = 0x2105)
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x2105' }],
          })
          console.log('[Wallet] Switched Farcaster wallet to Base')
        } catch (switchError) {
          console.log('[Wallet] Chain switch failed, trying to add Base:', switchError)
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x2105',
                chainName: 'Base',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://mainnet.base.org'],
                blockExplorerUrls: ['https://basescan.org'],
              }],
            })
            console.log('[Wallet] Added and switched to Base')
          } catch (addError) {
            console.error('[Wallet] Failed to add Base chain:', addError)
          }
        }

        // Add timeout to accounts request too
        const accountsPromise = provider.request({ method: 'eth_accounts' })
        const accountsTimeout = new Promise<string[]>((resolve) => {
          setTimeout(() => resolve([]), 3000)
        })

        const accounts = await Promise.race([accountsPromise, accountsTimeout]) as string[]

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
      isSafe,
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
  // Default to browser mode immediately - no blocking loading screen
  const [isFarcaster, setIsFarcaster] = useState(false)
  const [isSafe, setIsSafe] = useState(false)

  useEffect(() => {
    const detectEnvironment = async () => {
      // Safe detection — check if running inside Safe iframe
      try {
        const { default: SafeAppsSDK } = await import('@safe-global/safe-apps-sdk')
        const safeSdk = new SafeAppsSDK()
        const safeInfo = await Promise.race([
          safeSdk.safe.getInfo(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
        ])
        if (safeInfo && safeInfo.safeAddress) {
          console.log('[WalletProvider] Safe environment detected:', safeInfo.safeAddress)
          setIsSafe(true)
          return // Skip Farcaster detection
        }
      } catch (e) {
        console.log('[WalletProvider] Not in Safe context')
      }

      try {
        console.log('[WalletProvider] Starting Farcaster detection...')

        // Dynamic import to avoid module-level crashes
        let sdk: any
        try {
          sdk = (await import('@farcaster/miniapp-sdk')).default
        } catch (e) {
          console.log('[WalletProvider] Failed to import SDK:', e)
          return
        }

        // Always call ready() — on mobile Warpcast this dismisses the splash screen.
        // Without this call, the app is stuck behind Warpcast's splash forever.
        // In browser, this is a harmless no-op.
        try {
          sdk.actions.ready()
          console.log('[WalletProvider] Called sdk.actions.ready()')
        } catch (e) {
          console.log('[WalletProvider] sdk.actions.ready() failed:', e)
        }

        if (!sdk?.wallet?.getEthereumProvider) {
          console.log('[WalletProvider] SDK missing wallet methods, browser mode')
          return
        }

        // Try to get provider with timeout — this is the real Farcaster detection.
        // Works in both iframe (desktop) and WebView (mobile Warpcast).
        const providerPromise = sdk.wallet.getEthereumProvider()
        const timeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 2000)
        })

        const provider = await Promise.race([providerPromise, timeoutPromise])
        console.log('[WalletProvider] Provider result:', !!provider)

        if (provider) {
          console.log('[WalletProvider] Farcaster environment detected')
          setIsFarcaster(true)
        } else {
          console.log('[WalletProvider] No provider, staying in browser mode')
        }
      } catch (error) {
        console.log('[WalletProvider] Detection error:', error)
      }
    }

    detectEnvironment()
  }, [])

  // Always render immediately - no blocking loading screen
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
          <WalletInner isFarcaster={isFarcaster} isSafe={isSafe}>
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
  const { isFarcaster, isSafe, address, isConnected } = useWalletContext()

  // In Safe, wallet is auto-connected via wagmi Safe connector
  if (isSafe && address) {
    return (
      <div className="wallet-status">
        <span className="wallet-address">
          Safe: {address.slice(0, 6)}...{address.slice(-4)}
        </span>
      </div>
    )
  }

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
