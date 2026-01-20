/**
 * V4 Pool Operations using Uniswap SDK
 *
 * This module provides safe wrappers for V4 pool operations using the official
 * Uniswap SDK with decimal validation.
 *
 * Note: For now, this returns the encoded V4 actions. The worker will wrap these
 * in the modifyLiquidities() call with deadline.
 */

import { V4Planner, Actions } from '@uniswap/v4-sdk';
import {
  createPoolKey,
  validateTokenPair,
  type TokenInfo,
  type PoolKey,
} from './uniswap-sdk-wrapper';
import type { Address } from '../constants/common';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface V4MintPositionParams {
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0Max: bigint;
  amount1Max: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  recipient: Address;
}

export interface V4InitializePoolParams {
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  tickSpacing: number;
  sqrtPriceX96: bigint;
}

export interface EncodedV4Actions {
  actions: string; // hex string of encoded actions
  params: string[]; // array of hex-encoded parameters
  poolKey: PoolKey;
  validation: {
    valid: boolean;
    error?: string;
    warnings?: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SDK ENCODING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Encode a V4 mint position using the official Uniswap SDK.
 * Returns actions and params that need to be wrapped in modifyLiquidities(unlockData, deadline).
 *
 * @param params - Mint position parameters
 * @returns Encoded V4 actions with validation result
 */
export function encodeV4MintPosition(params: V4MintPositionParams): EncodedV4Actions {
  console.log('[V4 SDK] Encoding mint position...');
  console.log(`  Token0: ${params.token0.symbol} (${params.token0.decimals} decimals)`);
  console.log(`  Token1: ${params.token1.symbol} (${params.token1.decimals} decimals)`);
  console.log(`  Fee: ${params.fee / 10000}%`);
  console.log(`  Ticks: [${params.tickLower}, ${params.tickUpper}]`);
  console.log(`  Liquidity: ${params.liquidity.toString()}`);

  // STEP 1: Validate token pair
  const validation = validateTokenPair(params.token0, params.token1);

  if (!validation.valid) {
    console.error('[V4 SDK] Validation failed:', validation.error);
    return {
      actions: '0x',
      params: [],
      poolKey: {} as PoolKey,
      validation,
    };
  }

  // Log warnings
  if (validation.warnings) {
    validation.warnings.forEach(warning => console.warn(`[V4 SDK] ${warning}`));
  }

  // STEP 2: Create pool key with sorted tokens
  const { poolKey } = createPoolKey({
    token0: params.token0,
    token1: params.token1,
    fee: params.fee,
    tickSpacing: params.tickSpacing,
  });

  console.log('[V4 SDK] Pool key created:', poolKey);

  // STEP 3: Build V4 actions using SDK
  const v4Planner = new V4Planner();

  // Action 1: MINT_POSITION
  v4Planner.addAction(Actions.MINT_POSITION, [{
    poolKey,
    tickLower: params.tickLower,
    tickUpper: params.tickUpper,
    liquidity: params.liquidity.toString(),
    amount0Max: params.amount0Max.toString(),
    amount1Max: params.amount1Max.toString(),
    amount0Min: params.amount0Min.toString(),
    amount1Min: params.amount1Min.toString(),
    recipient: params.recipient,
    hookData: '0x' as `0x${string}`,
  }]);

  // Action 2: SETTLE_ALL for both tokens
  v4Planner.addAction(Actions.SETTLE_ALL, [poolKey.currency0, params.amount0Max.toString()]);
  v4Planner.addAction(Actions.SETTLE_ALL, [poolKey.currency1, params.amount1Max.toString()]);

  // STEP 4: Finalize V4 planner (populates actions and params)
  v4Planner.finalize();

  console.log('[V4 SDK] ✅ Mint position encoded successfully');
  console.log(`  Actions: ${v4Planner.actions}`);
  console.log(`  Params: ${v4Planner.params.length} items`);

  return {
    actions: v4Planner.actions,
    params: v4Planner.params,
    poolKey,
    validation,
  };
}

/**
 * NOTE: Pool initialization is NOT part of V4Planner actions.
 * Use the existing ethers.js encoding (encodeInitializePool) for this.
 * This function only validates the token pair.
 *
 * @param params - Pool initialization parameters
 * @returns Validation result and pool key
 */
export function validateV4PoolInit(params: V4InitializePoolParams): {
  poolKey: PoolKey;
  validation: {
    valid: boolean;
    error?: string;
    warnings?: string[];
  };
} {
  console.log('[V4 SDK] Validating pool initialization...');
  console.log(`  Token0: ${params.token0.symbol} (${params.token0.decimals} decimals)`);
  console.log(`  Token1: ${params.token1.symbol} (${params.token1.decimals} decimals)`);

  // STEP 1: Validate token pair
  const validation = validateTokenPair(params.token0, params.token1);

  if (!validation.valid) {
    console.error('[V4 SDK] Validation failed:', validation.error);
    return {
      poolKey: {} as PoolKey,
      validation,
    };
  }

  if (validation.warnings) {
    validation.warnings.forEach(warning => console.warn(`[V4 SDK] ${warning}`));
  }

  // STEP 2: Create pool key
  const { poolKey } = createPoolKey({
    token0: params.token0,
    token1: params.token1,
    fee: params.fee,
    tickSpacing: params.tickSpacing,
  });

  console.log('[V4 SDK] ✅ Pool initialization validated');

  return {
    poolKey,
    validation,
  };
}

/**
 * NOTE: This only encodes the MINT_POSITION part.
 * Pool initialization must be handled separately using encodeInitializePool (ethers.js).
 * The worker will use multicall to combine both operations.
 *
 * @param mintParams - Mint position parameters
 * @returns Encoded V4 mint actions (initialization handled separately)
 */
export function encodeV4MintForNewPool(mintParams: V4MintPositionParams): EncodedV4Actions {
  console.log('[V4 SDK] Encoding mint position for new pool...');
  console.log('  Note: Pool initialization must be done separately via multicall');

  // Just use the regular mint encoding
  return encodeV4MintPosition(mintParams);
}

// Exports are inline with interface declarations above
