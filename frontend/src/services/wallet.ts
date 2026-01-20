/**
 * Farcaster wallet integration
 */

import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Get wallet address from Farcaster Ethereum provider
 * @returns Wallet address or null if not available
 */
export async function getWalletAddress(): Promise<string | null> {
  try {
    console.log('[Wallet] Getting Ethereum provider...');

    // Get the Ethereum provider from Farcaster SDK
    const provider = await sdk.wallet.getEthereumProvider();

    if (!provider) {
      console.log('[Wallet] No Ethereum provider available');
      return null;
    }

    console.log('[Wallet] Provider available, requesting accounts...');

    // Request accounts using EIP-1193 standard
    const accounts = await provider.request({
      method: 'eth_requestAccounts'
    }) as string[];

    if (accounts && accounts.length > 0) {
      console.log('[Wallet] Account found:', accounts[0]);
      return accounts[0];
    }

    console.log('[Wallet] No accounts returned');
    return null;
  } catch (error) {
    console.error('[Wallet] Error getting wallet:', error);
    return null;
  }
}
