/**
 * Test Swap Execution
 *
 * Tests V4 swap with a tiny amount ($0.10 equivalent)
 * Safe for testing without risking much capital
 */

import dotenv from 'dotenv';
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  executeV4Swap,
  createPoolKey,
  getSwapDirection,
  type SwapParams,
} from './uniswap-v4-swap';

dotenv.config({ path: '../.env' });

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  ARBME: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07',
  CLANKER: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb',
} as const;

const POOLS = {
  // ARBME/WETH - V4, 3% fee, tickSpacing 200
  ARBME_WETH: {
    token0: TOKENS.ARBME,
    token1: TOKENS.WETH,
    fee: 30000, // 3%
    tickSpacing: 200,
  },
  // CLANKER/ARBME - V4, 3% fee, tickSpacing 200
  CLANKER_ARBME: {
    token0: TOKENS.ARBME, // Note: sorted order
    token1: TOKENS.CLANKER,
    fee: 30000, // 3%
    tickSpacing: 200,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════════

const PRIVATE_KEY = `0x${process.env.PRIVATE_KEY}`;
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY!;

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
});

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

async function testTinySwap() {
  console.log('🧪 TESTING V4 SWAP WITH TINY AMOUNT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Wallet: ${account.address}`);
  console.log('');

  // Test 1: Sell a small amount of ARBME for WETH
  // Use 100,000 ARBME (~$0.07 at current prices)
  const testAmount = parseUnits('100000', 18);

  console.log('Test Swap: Sell 100,000 ARBME for WETH');
  console.log(`Amount: ${testAmount.toString()} (100k ARBME)`);
  console.log(`Expected Value: ~$0.07`);
  console.log('');

  // Create pool key
  const poolKey = createPoolKey(
    POOLS.ARBME_WETH.token0,
    POOLS.ARBME_WETH.token1,
    POOLS.ARBME_WETH.fee,
    POOLS.ARBME_WETH.tickSpacing,
  );

  // Determine swap direction (selling ARBME)
  const zeroForOne = getSwapDirection(poolKey, TOKENS.ARBME);

  // Calculate minimum output (allow 2% slippage for testing)
  // At $7.45e-7 per ARBME and $3200 per WETH:
  // 100,000 ARBME = $0.0745
  // After 3% fee = $0.0723
  // In WETH = 0.0000226 WETH
  // With 2% slippage = 0.0000221 WETH
  const minAmountOut = parseUnits('0.000022', 18); // Very conservative

  const swapParams: SwapParams = {
    poolKey,
    zeroForOne,
    amountIn: testAmount,
    amountOutMinimum: minAmountOut,
  };

  console.log('Executing swap...');
  console.log('');

  const result = await executeV4Swap(
    walletClient,
    publicClient,
    swapParams,
    120, // 2 minute deadline
  );

  if (result.success) {
    console.log('✅ TEST SUCCESSFUL!');
    console.log(`TX: https://basescan.org/tx/${result.hash}`);
  } else {
    console.log('❌ TEST FAILED');
    console.log(`Error: ${result.error}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MENU
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: tsx src/test-swap.ts [command]');
    console.log('');
    console.log('Commands:');
    console.log('  test     - Execute a tiny test swap (100k ARBME → WETH, ~$0.07)');
    console.log('');
    console.log('Example:');
    console.log('  tsx src/test-swap.ts test');
    return;
  }

  const command = args[0];

  switch (command) {
    case 'test':
      await testTinySwap();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Run without arguments to see usage');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
