/**
 * Example: How to use the Uniswap SDK with decimal validation
 *
 * This demonstrates the pattern for safely using the Uniswap SDK
 * with our decimal safety rails in place.
 */

import { V4Planner, Actions } from '@uniswap/v4-sdk';
import { RoutePlanner, CommandType } from '@uniswap/universal-router-sdk';
import {
  createPoolKey,
  validateTokenPair,
  formatTokenAmount,
  type TokenInfo,
  type V4LiquidityParams,
  type V4SwapParams,
} from './uniswap-sdk-wrapper';

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 1: Create a V4 Pool (with validation)
// ═══════════════════════════════════════════════════════════════════════════════

export function exampleCreateV4Pool() {
  // Define tokens
  const arbme: TokenInfo = {
    address: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07',
    symbol: 'ARBME',
    decimals: 18,
  };

  const weth: TokenInfo = {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    decimals: 18,
  };

  // STEP 1: Validate token pair BEFORE using SDK
  const validation = validateTokenPair(arbme, weth);

  if (!validation.valid) {
    throw new Error(`Token validation failed: ${validation.error}`);
  }

  // Log any warnings (e.g., non-18 decimal whitelisted tokens)
  if (validation.warnings) {
    validation.warnings.forEach(warning => console.warn(warning));
  }

  // STEP 2: Create pool key with validated tokens
  const { poolKey } = createPoolKey({
    token0: arbme,
    token1: weth,
    fee: 30000, // 3%
    tickSpacing: 200,
  });

  console.log('✅ Pool key created safely:', poolKey);

  // STEP 3: Use SDK (tokens are already validated)
  // ... SDK calls here ...

  return poolKey;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 2: Add Liquidity to V4 Pool (with validation)
// ═══════════════════════════════════════════════════════════════════════════════

export function exampleAddV4Liquidity(params: V4LiquidityParams) {
  // STEP 1: Validate token pair
  const validation = validateTokenPair(params.token0, params.token1);

  if (!validation.valid) {
    throw new Error(`Cannot add liquidity: ${validation.error}`);
  }

  if (validation.warnings) {
    validation.warnings.forEach(warning => console.warn(warning));
  }

  // STEP 2: Create pool key
  const { poolKey } = createPoolKey({
    token0: params.token0,
    token1: params.token1,
    fee: params.fee,
    tickSpacing: params.tickSpacing,
    hooks: params.hooks,
  });

  // STEP 3: Build actions using V4 SDK
  const v4Planner = new V4Planner();

  // Add mint action
  const mintParams = {
    poolKey,
    tickLower: params.tickLower,
    tickUpper: params.tickUpper,
    liquidity: '0', // Will be calculated from amounts
    amount0Max: params.amount0.toString(),
    amount1Max: params.amount1.toString(),
    amount0Min: '0', // Add slippage tolerance in production
    amount1Min: '0',
    recipient: params.recipient,
    hookData: '0x',
  };

  v4Planner.addAction(Actions.MINT_POSITION, [mintParams]);
  v4Planner.addAction(Actions.SETTLE_ALL, [poolKey.currency0, params.amount0.toString()]);
  v4Planner.addAction(Actions.SETTLE_ALL, [poolKey.currency1, params.amount1.toString()]);

  // STEP 4: Wrap in RoutePlanner for UniversalRouter
  const routePlanner = new RoutePlanner();
  const encodedActions = v4Planner.finalize();
  routePlanner.addCommand(CommandType.V4_SWAP, [encodedActions]);

  const { commands, inputs } = routePlanner;

  console.log('✅ Liquidity transaction built safely');
  console.log(`   ${formatTokenAmount(params.amount0, params.token0.decimals, params.token0.symbol)}`);
  console.log(`   ${formatTokenAmount(params.amount1, params.token1.decimals, params.token1.symbol)}`);

  return { commands, inputs };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 3: Execute V4 Swap (with validation)
// ═══════════════════════════════════════════════════════════════════════════════

export function exampleV4Swap(
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint,
  minAmountOut: bigint,
  fee: number,
  tickSpacing: number
) {
  // STEP 1: Validate tokens
  const validation = validateTokenPair(tokenIn, tokenOut);

  if (!validation.valid) {
    throw new Error(`Cannot execute swap: ${validation.error}`);
  }

  if (validation.warnings) {
    validation.warnings.forEach(warning => console.warn(warning));
  }

  // STEP 2: Create pool key
  const { poolKey } = createPoolKey({
    token0: tokenIn,
    token1: tokenOut,
    fee,
    tickSpacing,
  });

  // Determine swap direction
  const zeroForOne = tokenIn.address.toLowerCase() === poolKey.currency0.toLowerCase();

  // STEP 3: Build swap using V4 SDK
  const v4Planner = new V4Planner();

  const swapConfig = {
    poolKey,
    zeroForOne,
    amountIn: amountIn.toString(),
    amountOutMinimum: minAmountOut.toString(),
    hookData: '0x',
  };

  v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);
  v4Planner.addAction(Actions.SETTLE_ALL, [
    zeroForOne ? poolKey.currency0 : poolKey.currency1,
    amountIn.toString(),
  ]);
  v4Planner.addAction(Actions.TAKE_ALL, [
    zeroForOne ? poolKey.currency1 : poolKey.currency0,
    minAmountOut.toString(),
  ]);

  // STEP 4: Wrap in RoutePlanner
  const routePlanner = new RoutePlanner();
  const encodedActions = v4Planner.finalize();
  routePlanner.addCommand(CommandType.V4_SWAP, [encodedActions]);

  const { commands, inputs } = routePlanner;

  console.log('✅ Swap transaction built safely');
  console.log(`   IN:  ${formatTokenAmount(amountIn, tokenIn.decimals, tokenIn.symbol)}`);
  console.log(`   OUT: ${formatTokenAmount(minAmountOut, tokenOut.decimals, tokenOut.symbol)} (min)`);

  return { commands, inputs };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 4: Handling Validation Errors
// ═══════════════════════════════════════════════════════════════════════════════

export function exampleValidationErrors() {
  // Example 1: 18-decimal tokens (auto-approved)
  console.log('\n--- Example 1: ARBME/WETH (both 18 decimals) ---');
  const arbme = { address: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07', symbol: 'ARBME', decimals: 18 };
  const weth = { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 };
  console.log(validateTokenPair(arbme, weth));
  // ✅ { valid: true }

  // Example 2: Whitelisted non-18 decimal token (cbBTC)
  console.log('\n--- Example 2: ARBME/cbBTC (18 + 8 decimals, whitelisted) ---');
  const cbbtc = { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC', decimals: 8 };
  console.log(validateTokenPair(arbme, cbbtc));
  // ✅ { valid: true, warnings: ['Using whitelisted 8-decimal token: cbBTC'] }

  // Example 3: USDC (whitelisted but disabled)
  console.log('\n--- Example 3: ARBME/USDC (6 decimals, disabled) ---');
  const usdc = { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 };
  console.log(validateTokenPair(arbme, usdc));
  // ❌ { valid: false, error: 'Token USDC is whitelisted but disabled...' }

  // Example 4: Random non-whitelisted token
  console.log('\n--- Example 4: Random 6-decimal token (not whitelisted) ---');
  const random = { address: '0x1234567890123456789012345678901234567890', symbol: 'RANDOM', decimals: 6 };
  console.log(validateTokenPair(arbme, random));
  // ❌ { valid: false, error: 'Token RANDOM has 6 decimals and is not whitelisted' }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRATION PATTERN FOR EXISTING CODE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BEFORE (manual encoding - unsafe):
 *
 * ```typescript
 * const calldata = '0xe8e33700' +
 *   token0.slice(2).padStart(64, '0') +
 *   token1.slice(2).padStart(64, '0') +
 *   amount0.toString(16).padStart(64, '0') +
 *   amount1.toString(16).padStart(64, '0');
 * ```
 *
 * AFTER (SDK with validation - safe):
 *
 * ```typescript
 * // 1. Validate tokens first
 * const validation = validateTokenPair(token0Info, token1Info);
 * if (!validation.valid) {
 *   throw new Error(validation.error);
 * }
 *
 * // 2. Use SDK to build transaction
 * const { commands, inputs } = exampleAddV4Liquidity({
 *   token0: token0Info,
 *   token1: token1Info,
 *   amount0,
 *   amount1,
 *   fee,
 *   tickSpacing,
 *   tickLower,
 *   tickUpper,
 *   recipient,
 *   deadline,
 * });
 *
 * // 3. Execute via UniversalRouter
 * await walletClient.writeContract({
 *   address: UNIVERSAL_ROUTER,
 *   abi: UNIVERSAL_ROUTER_ABI,
 *   functionName: 'execute',
 *   args: [commands, inputs],
 * });
 * ```
 */
