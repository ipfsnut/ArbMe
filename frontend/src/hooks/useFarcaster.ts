import { useState, useEffect, useCallback } from 'react'

// Farcaster Mini App SDK types
interface FarcasterContext {
  user?: {
    fid?: number
    username?: string
    displayName?: string
    pfpUrl?: string
    custodyAddress?: string
    verifiedAddresses?: {
      ethAddresses?: string[]
    }
  }
  location?: {
    type: string
    cast?: {
      fid: number
      hash: string
    }
  }
}

interface FarcasterSDK {
  context: Promise<FarcasterContext>
  actions: {
    ready: () => Promise<void>
    openUrl: (url: string) => Promise<void>
    close: () => Promise<void>
  }
  wallet: {
    ethProvider: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    }
  }
}

declare global {
  interface Window {
    farcasterSDK?: FarcasterSDK
  }
}

// Dynamic import of Farcaster SDK
let sdkPromise: Promise<FarcasterSDK> | null = null

async function loadFarcasterSDK(): Promise<FarcasterSDK> {
  if (sdkPromise) return sdkPromise

  sdkPromise = (async () => {
    try {
      // @ts-expect-error - ESM import from CDN
      const module = await import('https://esm.sh/@farcaster/miniapp-sdk')
      return module.sdk as FarcasterSDK
    } catch (e) {
      console.log('[ArbMe] Not in Farcaster context:', e)
      throw e
    }
  })()

  return sdkPromise
}

export function useFarcaster() {
  const [isLoading, setIsLoading] = useState(true)
  const [isInFarcaster, setIsInFarcaster] = useState(false)
  const [context, setContext] = useState<FarcasterContext | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [sdk, setSDK] = useState<FarcasterSDK | null>(null)

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const farcasterSDK = await loadFarcasterSDK()
        if (!mounted) return

        setSDK(farcasterSDK)
        setIsInFarcaster(true)

        // Get context
        const ctx = await farcasterSDK.context
        if (!mounted) return
        setContext(ctx)

        // Extract wallet address
        let wallet: string | null = null
        if (ctx?.user?.verifiedAddresses?.ethAddresses?.length) {
          wallet = ctx.user.verifiedAddresses.ethAddresses[0]
        } else if (ctx?.user?.custodyAddress) {
          wallet = ctx.user.custodyAddress
        }
        setAddress(wallet)

        // Signal ready
        await farcasterSDK.actions.ready()
      } catch (e) {
        console.log('[ArbMe] Farcaster SDK not available:', e)
        setIsInFarcaster(false)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [])

  // Request wallet connection via Farcaster provider
  const connectWallet = useCallback(async () => {
    if (!sdk) {
      console.log('[ArbMe] No SDK available')
      return null
    }

    try {
      const provider = sdk.wallet.ethProvider
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
      if (accounts?.length > 0) {
        setAddress(accounts[0])
        return accounts[0]
      }
    } catch (e) {
      console.error('[ArbMe] Failed to connect wallet:', e)
    }

    return null
  }, [sdk])

  // Get the eth provider for transactions
  const getProvider = useCallback(() => {
    return sdk?.wallet.ethProvider || null
  }, [sdk])

  return {
    isLoading,
    isInFarcaster,
    context,
    address,
    connectWallet,
    getProvider,
    sdk,
  }
}
