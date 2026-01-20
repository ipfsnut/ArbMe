/**
 * Uniswap V4 Swap Execution
 *
 * Implements actual swap execution via UniversalRouter
 *
 * Based on: https://docs.uniswap.org/contracts/v4/quickstart/swap
 */

import {
  type Address,
  type PublicClient,
  type WalletClient,
  encodeAbiParameters,
  parseAbiParameters,
  encodePacked,
  type Hash,
  parseUnits,
  formatUnits,
} from 'viem';

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════════

export const CONTRACTS = {
  // Universal Router for V4 (Base Mainnet)
  // https://basescan.org/address/0x6ff5693b99212da76ad316178a184ab56d299b43
  UNIVERSAL_ROUTER: '0x6ff5693b99212da76ad316178a184ab56d299b43' as Address,

  // Permit2 - token approval manager
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,

  // PoolManager - V4 singleton
  POOL_MANAGER: '0x498581ff718922c3f8e6a244956af099b2652b2b' as Address,
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMMANDS & ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const Commands = {
  V4_SWAP: 0x10,
} as const;

export const Actions = {
  SWAP_EXACT_IN_SINGLE: 0x00,
  SWAP_EXACT_IN: 0x01,
  SWAP_EXACT_OUT_SINGLE: 0x02,
  SWAP_EXACT_OUT: 0x03,
  SETTLE_ALL: 0x10,
  SETTLE_PAIR: 0x11,
  SETTLE: 0x12,
  TAKE_ALL: 0x13,
  TAKE_PORTION: 0x14,
  TAKE_PAIR: 0x15,
  TAKE: 0x16,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Currency {
  address: Address;
  isNative: boolean;
}

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
  sqrtPriceLimitX96?: bigint;
  hookData?: `0x${string}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABIs
// ═══════════════════════════════════════════════════════════════════════════════

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

const UNIVERSAL_ROUTER_ABI = [
  {
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

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

// ═══════════════════════════════════════════════════════════════════════════════
// POOL KEY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a PoolKey for a V4 pool
 * Currencies must be sorted (currency0 < currency1)
 */
export function createPoolKey(
  token0: Address,
  token1: Address,
  fee: number,
  tickSpacing: number,
  hooks: Address = '0x0000000000000000000000000000000000000000',
): PoolKey {
  // Ensure tokens are sorted
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

/**
 * Determines swap direction (zeroForOne)
 * Returns true if swapping currency0 → currency1
 */
export function getSwapDirection(
  poolKey: PoolKey,
  tokenIn: Address,
): boolean {
  return tokenIn.toLowerCase() === poolKey.currency0.toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVALS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step 1: Approve Permit2 to spend tokens
 */
export async function approveTokenForPermit2(
  client: WalletClient,
  publicClient: PublicClient,
  token: Address,
  amount: bigint = BigInt('0xffffffffffffffffffffffffffffffffffffffff'), // Max uint160
): Promise<Hash | null> {
  const account = client.account!;

  // Check current allowance
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

/**
 * Step 2: Approve UniversalRouter via Permit2
 */
export async function approveRouterViaPermit2(
  client: WalletClient,
  publicClient: PublicClient,
  token: Address,
  amount: bigint = BigInt('0xffffffffffffffffffffffffffffffffffffffff'), // Max uint160
  expiration: number = Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
): Promise<Hash | null> {
  const account = client.account!;

  // Check current allowance
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
// SWAP ENCODING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Encodes a V4 swap for the UniversalRouter
 */
export function encodeV4Swap(params: SwapParams): {
  commands: `0x${string}`;
  inputs: `0x${string}`[];
} {
  // Actions to perform
  const actions = encodePacked(
    ['uint8', 'uint8', 'uint8'],
    [
      Actions.SWAP_EXACT_IN_SINGLE,
      Actions.SETTLE_ALL,
      Actions.TAKE_ALL,
    ],
  );

  // Determine which currency is input/output
  const currencyIn = params.zeroForOne
    ? params.poolKey.currency0
    : params.poolKey.currency1;
  const currencyOut = params.zeroForOne
    ? params.poolKey.currency1
    : params.poolKey.currency0;

  // Encode parameters for each action
  const actionParams: `0x${string}`[] = [];

  // 1. SWAP_EXACT_IN_SINGLE params
  actionParams.push(
    encodeAbiParameters(
      parseAbiParameters('(address,address,uint24,int24,address),bool,uint128,uint128,uint160,bytes'),
      [
        [
          params.poolKey.currency0,
          params.poolKey.currency1,
          params.poolKey.fee,
          params.poolKey.tickSpacing,
          params.poolKey.hooks,
        ],
        params.zeroForOne,
        params.amountIn,
        params.amountOutMinimum,
        params.sqrtPriceLimitX96 || 0n,
        params.hookData || '0x',
      ],
    ),
  );

  // 2. SETTLE_ALL params (input currency and amount)
  actionParams.push(
    encodeAbiParameters(
      parseAbiParameters('address,uint256'),
      [currencyIn, params.amountIn],
    ),
  );

  // 3. TAKE_ALL params (output currency and minimum)
  actionParams.push(
    encodeAbiParameters(
      parseAbiParameters('address,uint256'),
      [currencyOut, params.amountOutMinimum],
    ),
  );

  // Combine actions and params
  const input = encodeAbiParameters(
    parseAbiParameters('bytes,bytes[]'),
    [actions, actionParams],
  );

  // Command for V4_SWAP
  const commands = encodePacked(['uint8'], [Commands.V4_SWAP]);

  return {
    commands,
    inputs: [input],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWAP EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface SwapResult {
  success: boolean;
  hash?: Hash;
  error?: string;
  gasUsed?: bigint;
}

/**
 * Execute a swap on Uniswap V4
 */
export async function executeV4Swap(
  client: WalletClient,
  publicClient: PublicClient,
  params: SwapParams,
): Promise<SwapResult> {
  try {
    const account = client.account!;

    console.log('\n🔄 EXECUTING V4 SWAP');
    console.log('═══════════════════════════════════════════════════════════════');

    // Step 1: Ensure approvals
    const tokenIn = params.zeroForOne
      ? params.poolKey.currency0
      : params.poolKey.currency1;

    console.log('Step 1: Checking approvals...');
    await approveTokenForPermit2(client, publicClient, tokenIn);
    await approveRouterViaPermit2(client, publicClient, tokenIn);

    // Step 2: Encode swap
    console.log('Step 2: Encoding swap...');
    const { commands, inputs } = encodeV4Swap(params);

    console.log(`  Pool: ${params.poolKey.currency0} / ${params.poolKey.currency1}`);
    console.log(`  Fee: ${params.poolKey.fee / 10000}%`);
    console.log(`  Direction: ${params.zeroForOne ? 'Token0 → Token1' : 'Token1 → Token0'}`);
    console.log(`  Amount In: ${formatUnits(params.amountIn, 18)}`);
    console.log(`  Min Out: ${formatUnits(params.amountOutMinimum, 18)}`);

    // Step 3: Execute
    console.log('Step 3: Executing swap...');

    // Manual gas limit to avoid over-estimation
    // V4 swaps on Base typically use ~200k gas
    const hash = await client.writeContract({
      account,
      chain: null,
      address: CONTRACTS.UNIVERSAL_ROUTER,
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: 'execute',
      args: [commands, inputs],
      value: 0n, // No native ETH for now
      gas: 300000n, // Manual gas limit (generous for safety)
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
