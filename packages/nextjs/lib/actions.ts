/**
 * Farcaster action handlers (Buy, Tip, etc.)
 */

import sdk from '@farcaster/miniapp-sdk';
import { ARBME_ADDRESS } from '../utils/constants';

// Tip jar wallet address
const TIP_JAR_ADDRESS = '0x2C421b1c21bB88F1418cC525934E62F2c48C19df';

/**
 * Launch Farcaster's swap widget to buy $ARBME
 */
export async function buyArbme(): Promise<void> {
  try {
    console.log('[Actions] Opening buy widget for ARBME...');

    // CAIP-19 format: eip155:<chainId>/erc20:<tokenAddress>
    // Base = chain 8453
    const arbmeToken = `eip155:8453/erc20:${ARBME_ADDRESS}`;

    const result = await sdk.actions.swapToken({
      buyToken: arbmeToken,
    });

    if (result.success) {
      console.log('[Actions] Swap completed:', result.swap.transactions);
    } else {
      console.log('[Actions] Swap cancelled or failed:', result.reason);
    }
  } catch (error) {
    console.error('[Actions] Error opening buy widget:', error);
  }
}

/**
 * Send tip in $ARBME to the tip jar
 */
export async function sendTip(amountArbme: string = '1'): Promise<void> {
  try {
    console.log(`[Actions] Sending ${amountArbme} ARBME tip...`);

    // CAIP-19 format for ARBME on Base
    const arbmeToken = `eip155:8453/erc20:${ARBME_ADDRESS}`;

    // Convert to wei (18 decimals)
    const amountWei = (parseFloat(amountArbme) * 1e18).toString();

    const result = await sdk.actions.sendToken({
      token: arbmeToken,
      amount: amountWei,
      recipientAddress: TIP_JAR_ADDRESS,
    });

    if (result.success) {
      console.log('[Actions] Tip sent:', result.send.transaction);
    } else {
      console.log('[Actions] Tip cancelled or failed:', result.reason);
    }
  } catch (error) {
    console.error('[Actions] Error sending tip:', error);
  }
}

/**
 * Collect fees from a Uniswap position
 */
export async function collectFees(positionId: string, recipient: string): Promise<void> {
  try {
    console.log(`[Actions] Collecting fees for position ${positionId}...`);

    // Build the transaction via API
    const response = await fetch('/app/api/collect-fees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionId, recipient }),
    });

    if (!response.ok) {
      throw new Error('Failed to build collect fees transaction');
    }

    const tx = await response.json();

    // Send transaction via Ethereum provider
    const provider = await sdk.wallet.getEthereumProvider();
    if (!provider) {
      throw new Error('No Ethereum provider available');
    }

    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: recipient as `0x${string}`,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value as `0x${string}` || '0x0',
      }],
    });

    console.log('[Actions] Fees collected:', txHash);
    alert('Fees collected successfully!');
  } catch (error) {
    console.error('[Actions] Error collecting fees:', error);
    alert('Failed to collect fees. Please try again.');
  }
}
