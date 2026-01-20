/**
 * Test V4 Swap using Official SDK
 */

import dotenv from 'dotenv';
import { createPublicClient, createWalletClient, http, parseUnits, encodeAbiParameters, parseAbiParameters } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { V4Planner, Actions } from '@uniswap/v4-sdk';
import { RoutePlanner, CommandType } from '@uniswap/universal-router-sdk';
import { approveTokenForPermit2, approveRouterViaPermit2, CONTRACTS } from './uniswap-v4-swap-sdk';

dotenv.config({ path: '../.env' });

const TOKENS = {
  CLANKER: '0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb',
  ARBME: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07',
} as const;

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

async function testSwapSDK() {
  console.log('🧪 TESTING V4 SWAP WITH SDK');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Wallet: ${account.address}\n`);

  // Pool configuration (from NFT position #988887)
  const poolKey = {
    currency0: TOKENS.CLANKER,
    currency1: TOKENS.ARBME,
    fee: 30000, // 3%
    tickSpacing: 200,
    hooks: '0x0000000000000000000000000000000000000000',
  };

  // Swap 10k ARBME for CLANKER (tiny test ~$0.007)
  const amountIn = parseUnits('10000', 18);
  const minAmountOut = parseUnits('0.0001', 18); // Very small minimum

  console.log('Swap Config:');
  console.log(`  Sell: 10,000 ARBME`);
  console.log(`  For: CLANKER (min 0.0001)`);
  console.log(`  Pool Fee: 3%\n`);

  // Step 1: Approvals
  console.log('Step 1: Approvals...');
  await approveTokenForPermit2(walletClient, publicClient, TOKENS.ARBME);
  await approveRouterViaPermit2(walletClient, publicClient, TOKENS.ARBME);

  // Step 2: Build swap with V4Planner
  console.log('\nStep 2: Building swap with V4Planner...');

  const v4Planner = new V4Planner();

  // Add SWAP_EXACT_IN_SINGLE action
  const swapConfig = {
    poolKey,
    zeroForOne: false, // ARBME (currency1) → CLANKER (currency0)
    amountIn: amountIn.toString(),
    amountOutMinimum: minAmountOut.toString(),
    hookData: '0x',
  };

  v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);
  v4Planner.addAction(Actions.SETTLE_ALL, [poolKey.currency1, amountIn.toString()]); // ARBME in
  v4Planner.addAction(Actions.TAKE_ALL, [poolKey.currency0, minAmountOut.toString()]); // CLANKER out

  console.log('  ✅ V4 actions added');

  // Step 3: Wrap in RoutePlanner
  console.log('Step 3: Building UniversalRouter command...');

  const routePlanner = new RoutePlanner();

  // Finalize V4 actions (encodes actions + params together)
  const encodedActions = v4Planner.finalize();

  // Pass the encoded result to RoutePlanner
  routePlanner.addCommand(CommandType.V4_SWAP, [encodedActions]);

  console.log('  ✅ Route planned');

  // Step 4: Execute
  console.log('\nStep 4: Executing swap...');

  const commands = routePlanner.commands;
  const inputs = routePlanner.inputs;

  console.log(`  Commands: ${commands}`);
  console.log(`  Inputs length: ${inputs.length}`);

  // Add deadline (10 minutes from now)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  try {
    const hash = await walletClient.writeContract({
      address: CONTRACTS.UNIVERSAL_ROUTER,
      abi: [{
        inputs: [
          { name: 'commands', type: 'bytes' },
          { name: 'inputs', type: 'bytes[]' },
          { name: 'deadline', type: 'uint256' },
        ],
        name: 'execute',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
      }],
      functionName: 'execute',
      args: [commands as `0x${string}`, inputs as `0x${string}`[], deadline],
      value: 0n,
      gas: 300000n,
    });

    console.log(`  ✅ TX submitted: ${hash}`);
    console.log('  Waiting for confirmation...\n');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`${receipt.status === 'success' ? '✅' : '❌'} SWAP ${receipt.status === 'success' ? 'SUCCESSFUL' : 'FAILED'}!`);
    console.log(`  TX: https://basescan.org/tx/${hash}`);
    console.log(`  Gas Used: ${receipt.gasUsed.toString()}`);
    console.log(`  Status: ${receipt.status}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (receipt.status === 'reverted') {
      console.log('Transaction reverted. Check BaseScan for details.');
    }
  } catch (error) {
    console.error('❌ Error executing swap:');
    console.error(error);
  }
}

testSwapSDK().catch(console.error);
