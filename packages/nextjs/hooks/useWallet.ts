/**
 * Wallet connection hook
 * Works with both Farcaster SDK and browser wallets (wagmi)
 */

'use client';

import { useWalletContext } from '@/components/WalletProvider';

/**
 * Get the connected wallet address
 * Returns null if not connected
 */
export function useWallet(): string | null {
  const { address } = useWalletContext();
  return address;
}

/**
 * Check if wallet is connected
 */
export function useIsConnected(): boolean {
  const { isConnected } = useWalletContext();
  return isConnected;
}

/**
 * Check if running in Farcaster
 */
export function useIsFarcaster(): boolean {
  const { isFarcaster } = useWalletContext();
  return isFarcaster;
}

/**
 * Check if running inside a Gnosis Safe
 */
export function useIsSafe(): boolean {
  const { isSafe } = useWalletContext();
  return isSafe;
}
