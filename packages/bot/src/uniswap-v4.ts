/**
 * Uniswap V4 Integration
 *
 * Handles quoting and executing swaps on Uniswap V4 pools
 */

import {
  type Address,
  type PublicClient,
  type WalletClient,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  encodePacked,
  formatUnits,
} from 'viem';

// ═══════════════════════════════════════════════════════════════════════════════
// UNISWAP V4 CONTRACTS (Base Mainnet)
// ═══════════════════════════════════════════════════════════════════════════════

export const V4_CONTRACTS = {
  POOL_MANAGER: '0x498581ff718922c3f8e6a244956af099b2652b2b' as Address,
  STATE_VIEW: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71' as Address,
  POSITION_MANAGER: '0x7c5f5a4bbd8fd63184577525326123b519429bdc' as Address,
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  UNIVERSAL_ROUTER: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD' as Address, // for swaps
};

// ═══════════════════════════════════════════════════════════════════════════════
// POOL CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const POOLS = {
  // From API monitoring - ARBME/WETH
  ARBME_WETH: '0x6afd39b7114a0892d10ffaae2eefcc16777dd376273c25d9d4f3a1a065131b83' as Address,

  // From worker constants - CLANKER/ARBME (3% fee)
  CLANKER_ARBME: '0x10830495714f0463b22fddb2e329e372f3ff86a865f01237cd98e4fc8770311a' as Address,

  // From worker constants - PAGE/ARBME (3% fee)
  PAGE_ARBME: '0xdf48ea28c119178022522d8d8a15d8529b2b7db17748a264bf630f4ae5bbbda2' as Address,
};

// ═══════════════════════════════════════════════════════════════════════════════
// ABIs
// ═══════════════════════════════════════════════════════════════════════════════

const STATE_VIEW_ABI = [
  {
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    name: 'getSlot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    name: 'getLiquidity',
    outputs: [{ name: 'liquidity', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate price from sqrtPriceX96
 * price = (sqrtPriceX96 / 2^96)^2
 */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
  invert: boolean = false
): number {
  const Q96 = 2n ** 96n;
  const numerator = sqrtPriceX96 * sqrtPriceX96;
  const denominator = Q96 * Q96;

  // Calculate base price (token1 per token0)
  let price = Number(numerator) / Number(denominator);

  // Adjust for decimals
  const decimalAdjustment = 10 ** (decimals0 - decimals1);
  price = price * decimalAdjustment;

  // Invert if needed (to get token0 per token1)
  if (invert) {
    price = 1 / price;
  }

  return price;
}

/**
 * Calculate expected output for a swap using constant product formula
 * with fees factored in
 */
export function calculateSwapOutput(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feePercent: number = 3
): bigint {
  // Fee is in basis points (3% = 3000 bps)
  const feeBps = BigInt(Math.floor(feePercent * 100));
  const bpsBase = 10000n;

  // Amount after fee
  const amountInWithFee = amountIn * (bpsBase - feeBps);

  // Constant product formula: (x + dx)(y - dy) = xy
  // dy = (y * dx) / (x + dx)
  const numerator = amountInWithFee * reserveOut;
  const denominator = (reserveIn * bpsBase) + amountInWithFee;

  return numerator / denominator;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POOL STATE QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PoolState {
  sqrtPriceX96: bigint;
  tick: number;
  protocolFee: number;
  lpFee: number;
  liquidity: bigint;
}

export async function getPoolState(
  client: PublicClient,
  poolId: Address,
): Promise<PoolState> {
  // Get slot0 data
  const [sqrtPriceX96, tick, protocolFee, lpFee] = await client.readContract({
    address: V4_CONTRACTS.STATE_VIEW,
    abi: STATE_VIEW_ABI,
    functionName: 'getSlot0',
    args: [poolId],
  });

  // Get liquidity
  const liquidity = await client.readContract({
    address: V4_CONTRACTS.STATE_VIEW,
    abi: STATE_VIEW_ABI,
    functionName: 'getLiquidity',
    args: [poolId],
  });

  return {
    sqrtPriceX96,
    tick,
    protocolFee,
    lpFee,
    liquidity,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWAP QUOTING
// ═══════════════════════════════════════════════════════════════════════════════

export interface SwapQuote {
  amountIn: bigint;
  expectedAmountOut: bigint;
  minAmountOut: bigint; // After slippage
  price: number;
  priceImpact: number;
  feeAmount: bigint;
  feePercent: number;
}

/**
 * Get a quote for swapping tokens
 * This uses the pool state to estimate the output
 */
export async function getSwapQuote(
  client: PublicClient,
  poolId: Address,
  amountIn: bigint,
  tokenIn: Address,
  tokenOut: Address,
  decimalsIn: number,
  decimalsOut: number,
  slippageTolerance: number = 0.005, // 0.5%
  feePercent: number = 3,
): Promise<SwapQuote> {
  // Get current pool state
  const state = await getPoolState(client, poolId);

  // Calculate fee
  const feeAmount = (amountIn * BigInt(feePercent * 100)) / 10000n;
  const amountInAfterFee = amountIn - feeAmount;

  // For V4, we need to derive reserves from liquidity and sqrtPrice
  // This is a simplified calculation - in production you'd use the actual tick math
  // For now, we'll use a linear approximation based on the current price

  // Get current price
  const currentPrice = sqrtPriceX96ToPrice(
    state.sqrtPriceX96,
    decimalsIn,
    decimalsOut,
    false
  );

  // Simple output calculation: amountIn * price, minus fees
  // This is approximate - real V4 math is more complex with concentrated liquidity
  const expectedAmountOut = BigInt(
    Math.floor(Number(amountInAfterFee) * currentPrice)
  );

  // Apply slippage tolerance
  const slippageFactor = 1 - slippageTolerance;
  const minAmountOut = BigInt(
    Math.floor(Number(expectedAmountOut) * slippageFactor)
  );

  // Price impact (simplified)
  const priceImpact = (Number(amountIn) / Number(state.liquidity)) * 100;

  return {
    amountIn,
    expectedAmountOut,
    minAmountOut,
    price: currentPrice,
    priceImpact,
    feeAmount,
    feePercent,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWAP EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a swap on Uniswap V4
 *
 * NOTE: This is a placeholder for the actual swap execution
 * Uniswap V4 swaps typically go through the UniversalRouter
 * which requires complex calldata encoding
 */
export async function executeSwap(
  walletClient: WalletClient,
  poolId: Address,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  minAmountOut: bigint,
  recipient: Address,
): Promise<{ hash: Address; success: boolean }> {
  // TODO: Build actual UniversalRouter calldata
  // This would involve:
  // 1. Encoding the swap path
  // 2. Building V4_SWAP command
  // 3. Executing through UniversalRouter

  // For now, return a placeholder
  console.log('⚠️  Swap execution not yet implemented');
  console.log(`   Would swap ${formatUnits(amountIn, 18)} ${tokenIn}`);
  console.log(`   For at least ${formatUnits(minAmountOut, 18)} ${tokenOut}`);
  console.log(`   On pool ${poolId}`);

  return {
    hash: '0x0000000000000000000000000000000000000000' as Address,
    success: false,
  };
}
