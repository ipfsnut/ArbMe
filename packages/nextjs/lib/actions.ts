/**
 * Farcaster action handlers (Buy, Tip, etc.)
 */

import { ARBME_ADDRESS } from '../utils/constants';

async function getSDK() {
  return (await import('@farcaster/miniapp-sdk')).default;
}

// Tip jar wallet address
const TIP_JAR_ADDRESS = '0x2C421b1c21bB88F1418cC525934E62F2c48C19df';

// $RATCHET token address
const RATCHET_ADDRESS = '0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07';

/**
 * Launch Farcaster's swap widget to buy $ARBME
 */
export async function buyArbme(): Promise<void> {
  try {
    console.log('[Actions] Opening buy widget for ARBME...');

    // CAIP-19 format: eip155:<chainId>/erc20:<tokenAddress>
    // Base = chain 8453
    const arbmeToken = `eip155:8453/erc20:${ARBME_ADDRESS}`;

    const sdk = await getSDK();
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
 * Launch Farcaster's swap widget to buy $RATCHET
 */
export async function buyRatchet(): Promise<void> {
  try {
    console.log('[Actions] Opening buy widget for RATCHET...');

    // CAIP-19 format: eip155:<chainId>/erc20:<tokenAddress>
    // Base = chain 8453
    const ratchetToken = `eip155:8453/erc20:${RATCHET_ADDRESS}`;

    const sdk = await getSDK();
    const result = await sdk.actions.swapToken({
      buyToken: ratchetToken,
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

    const sdk = await getSDK();
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
    const response = await fetch('/api/collect-fees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionId, recipient }),
    });

    if (!response.ok) {
      throw new Error('Failed to build collect fees transaction');
    }

    const tx = await response.json();

    // Send transaction via Ethereum provider
    const sdk = await getSDK();
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

// ═══════════════════════════════════════════════════════════════════════════════
// Staking Actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helper to send a staking transaction via browser wallet
 */
async function sendStakingTransaction(
  endpoint: string,
  body: object,
  recipient: string,
  successMessage: string
): Promise<string | null> {
  // Build the transaction via API
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to build transaction');
  }

  const { transaction } = await response.json();

  // Use browser wallet (window.ethereum)
  const ethereum = typeof window !== 'undefined' ? (window as any).ethereum : null;
  if (!ethereum) {
    throw new Error('No Ethereum provider available. Please install MetaMask or another wallet.');
  }

  console.log('[Actions] Sending transaction:', { to: transaction.to, from: recipient });

  const txHash = await ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from: recipient,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value || '0x0',
    }],
  });

  console.log(`[Actions] ${successMessage}:`, txHash);
  return txHash as string;
}

/**
 * Approve $RATCHET for staking
 */
export async function approveRatchetStaking(recipient: string): Promise<string | null> {
  try {
    console.log('[Actions] Approving RATCHET for staking...');
    return await sendStakingTransaction(
      '/api/staking/approve',
      {},
      recipient,
      'Approval completed'
    );
  } catch (error) {
    console.error('[Actions] Error approving for staking:', error);
    throw error;
  }
}

/**
 * Stake $RATCHET tokens
 * @param amount Amount in wei
 * @param recipient User's wallet address
 */
export async function stakeRatchet(amount: string, recipient: string): Promise<string | null> {
  try {
    console.log(`[Actions] Staking ${amount} RATCHET...`);
    return await sendStakingTransaction(
      '/api/staking/stake',
      { amount },
      recipient,
      'Stake completed'
    );
  } catch (error) {
    console.error('[Actions] Error staking:', error);
    throw error;
  }
}

/**
 * Withdraw staked $RATCHET tokens
 * @param amount Amount in wei
 * @param recipient User's wallet address
 */
export async function withdrawRatchet(amount: string, recipient: string): Promise<string | null> {
  try {
    console.log(`[Actions] Withdrawing ${amount} RATCHET...`);
    return await sendStakingTransaction(
      '/api/staking/withdraw',
      { amount },
      recipient,
      'Withdrawal completed'
    );
  } catch (error) {
    console.error('[Actions] Error withdrawing:', error);
    throw error;
  }
}

/**
 * Claim staking rewards
 * @param recipient User's wallet address
 */
export async function claimRatchetRewards(recipient: string): Promise<string | null> {
  try {
    console.log('[Actions] Claiming staking rewards...');
    return await sendStakingTransaction(
      '/api/staking/claim',
      {},
      recipient,
      'Rewards claimed'
    );
  } catch (error) {
    console.error('[Actions] Error claiming rewards:', error);
    throw error;
  }
}

/**
 * Exit staking (withdraw all + claim rewards)
 * @param recipient User's wallet address
 */
export async function exitRatchetStaking(recipient: string): Promise<string | null> {
  try {
    console.log('[Actions] Exiting staking...');
    return await sendStakingTransaction(
      '/api/staking/exit',
      {},
      recipient,
      'Exit completed'
    );
  } catch (error) {
    console.error('[Actions] Error exiting staking:', error);
    throw error;
  }
}
