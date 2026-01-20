/**
 * Uniswap V4 Swap Execution using Official SDK
 *
 * Uses @uniswap/v4-sdk and @uniswap/universal-router-sdk
 */

import {
  type Address,
  type PublicClient,
  type WalletClient,
  type Hash,
  formatUnits,
  parseUnits,
} from 'viem';
import { V4Planner, Actions } from '@uniswap/v4-sdk';
import { RoutePlanner, CommandType } from '@uniswap/universal-router-sdk';

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════════

export const CONTRACTS = {
  UNIVERSAL_ROUTER: '0x6ff5693b99212da76ad316178a184ab56d299b43' as Address,
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface SwapParams {
  poolKey: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum: bigint;
  hookData?: `0x${string}`;
}

export interface SwapResult {
  success: boolean;
  hash?: Hash;
  error?: string;
  gasUsed?: bigint;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABIs
// ═══════════════════════════════════════════════════════════════════════════════

const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const PERMIT2_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function createPoolKey(
  token0: Address,
  token1: Address,
  fee: number,
  tickSpacing: number,
  hooks: Address = '0x0000000000000000000000000000000000000000',
): PoolKey {
  const [currency0, currency1] =
    token0.toLowerCase() < token1.toLowerCase()
      ? [token0, token1]
      : [token1, token0];

  return {
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks,
  };
}

export function getSwapDirection(poolKey: PoolKey, tokenIn: Address): boolean {
  return tokenIn.toLowerCase() === poolKey.currency0.toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVALS
// ═══════════════════════════════════════════════════════════════════════════════

export async function approveTokenForPermit2(
  client: WalletClient,
  publicClient: PublicClient,
  token: Address,
): Promise<Hash | null> {
  const account = client.account!;
  const amount = BigInt('0xffffffffffffffffffffffffffffffffffffffff');

  const allowance = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, CONTRACTS.PERMIT2],
  });

  if (allowance >= amount) {
    console.log(`✅ Token already approved for Permit2`);
    return null;
  }

  console.log(`🔓 Approving ${token} for Permit2...`);

  const hash = await client.writeContract({
    account,
    chain: null,
    address: token,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [CONTRACTS.PERMIT2, amount],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`✅ Permit2 approval confirmed: ${hash}`);

  return hash;
}

export async function approveRouterViaPermit2(
  client: WalletClient,
  publicClient: PublicClient,
  token: Address,
): Promise<Hash | null> {
  const account = client.account!;
  const amount = BigInt('0xffffffffffffffffffffffffffffffffffffffff');
  const expiration = Math.floor(Date.now() / 1000) + 86400 * 30;

  const [allowanceAmount, allowanceExpiration] = await publicClient.readContract({
    address: CONTRACTS.PERMIT2,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: [account.address, token, CONTRACTS.UNIVERSAL_ROUTER],
  });

  if (allowanceAmount >= amount && allowanceExpiration > Math.floor(Date.now() / 1000)) {
    console.log(`✅ Router already approved via Permit2`);
    return null;
  }

  console.log(`🔓 Approving UniversalRouter via Permit2...`);

  const hash = await client.writeContract({
    account,
    chain: null,
    address: CONTRACTS.PERMIT2,
    abi: PERMIT2_ABI,
    functionName: 'approve',
    args: [token, CONTRACTS.UNIVERSAL_ROUTER, amount, expiration],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`✅ Router approval via Permit2 confirmed: ${hash}`);

  return hash;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWAP EXECUTION USING SDK
// ═══════════════════════════════════════════════════════════════════════════════

export async function executeV4SwapSDK(
  client: WalletClient,
  publicClient: PublicClient,
  params: SwapParams,
): Promise<SwapResult> {
  try {
    const account = client.account!;

    console.log('\n🔄 EXECUTING V4 SWAP (SDK)');
    console.log('═══════════════════════════════════════════════════════════════');

    // Step 1: Approvals
    console.log('Step 1: Checking approvals...');
    const tokenIn = params.zeroForOne
      ? params.poolKey.currency0
      : params.poolKey.currency1;

    await approveTokenForPermit2(client, publicClient, tokenIn);
    await approveRouterViaPermit2(client, publicClient, tokenIn);

    // Step 2: Build swap using SDK
    console.log('Step 2: Building swap with V4 SDK...');
    console.log(`  Pool: ${params.poolKey.currency0} / ${params.poolKey.currency1}`);
    console.log(`  Fee: ${params.poolKey.fee / 10000}%`);
    console.log(`  Direction: ${params.zeroForOne ? 'Token0 → Token1' : 'Token1 → Token0'}`);
    console.log(`  Amount In: ${formatUnits(params.amountIn, 18)}`);
    console.log(`  Min Out: ${formatUnits(params.amountOutMinimum, 18)}`);

    // Build swap using V4 SDK
    const v4Planner = new V4Planner();

    const swapConfig = {
      poolKey: params.poolKey,
      zeroForOne: params.zeroForOne,
      amountIn: params.amountIn.toString(),
      amountOutMinimum: params.amountOutMinimum.toString(),
      hookData: params.hookData || '0x',
    };

    v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);
    v4Planner.addAction(Actions.SETTLE_ALL, [
      params.zeroForOne ? params.poolKey.currency0 : params.poolKey.currency1,
      params.amountIn.toString(),
    ]);
    v4Planner.addAction(Actions.TAKE_ALL, [
      params.zeroForOne ? params.poolKey.currency1 : params.poolKey.currency0,
      params.amountOutMinimum.toString(),
    ]);

    // Wrap in RoutePlanner for UniversalRouter
    const routePlanner = new RoutePlanner();
    const encodedActions = v4Planner.finalize(); // Encodes actions + params together
    routePlanner.addCommand(CommandType.V4_SWAP, [encodedActions]);

    const { commands, inputs } = routePlanner;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    // Step 3: Execute
    console.log('Step 3: Executing swap...');

    const hash = await client.writeContract({
      account,
      chain: null,
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

    console.log(`  TX submitted: ${hash}`);
    console.log('  Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ SWAP SUCCESSFUL!`);
    console.log(`  TX Hash: ${hash}`);
    console.log(`  Gas Used: ${receipt.gasUsed.toString()}`);
    console.log(`  Status: ${receipt.status}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    return {
      success: receipt.status === 'success',
      hash,
      gasUsed: receipt.gasUsed,
    };
  } catch (error) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ SWAP FAILED');
    console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('═══════════════════════════════════════════════════════════════\n');

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
