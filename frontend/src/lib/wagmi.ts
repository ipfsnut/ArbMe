import { http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { coinbaseWallet, injected } from 'wagmi/connectors'

// API base URL - points to our Cloudflare Worker
export const API_BASE_URL = import.meta.env.PROD
  ? 'https://arbme-api.dylan-259.workers.dev'
  : 'http://localhost:8787'

export const config = createConfig({
  chains: [base],
  connectors: [
    // Coinbase Smart Wallet (works in Farcaster)
    coinbaseWallet({
      appName: 'ArbMe',
      preference: 'smartWalletOnly',
    }),
    // Injected wallets (MetaMask, etc.)
    injected(),
  ],
  transports: {
    [base.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
