/**
 * Farcaster wallet integration
 */

import sdk from '@farcaster/miniapp-sdk';

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

    // In Farcaster miniapp context, accounts are already available via eth_accounts
    // In browser context, we'd need eth_requestAccounts
    let accounts: string[] = [];

    try {
      // Try eth_accounts first (Farcaster miniapps have pre-authorized access)
      accounts = await provider.request({
        method: 'eth_accounts'
      }) as string[];

      if (accounts && accounts.length > 0) {
        console.log('[Wallet] Account found via eth_accounts:', accounts[0]);
        return accounts[0];
      }
    } catch (err) {
      console.log('[Wallet] eth_accounts failed:', err);
    }

    // Fallback: try eth_requestAccounts (for browser wallet connect)
    try {
      accounts = await provider.request({
        method: 'eth_requestAccounts'
      }) as string[];

      if (accounts && accounts.length > 0) {
        console.log('[Wallet] Account found via eth_requestAccounts:', accounts[0]);
        return accounts[0];
      }
    } catch (err) {
      console.log('[Wallet] eth_requestAccounts failed:', err);
    }

    console.log('[Wallet] No accounts available');
    return null;
  } catch (error) {
    console.error('[Wallet] Error getting wallet:', error);
    return null;
  }
}
