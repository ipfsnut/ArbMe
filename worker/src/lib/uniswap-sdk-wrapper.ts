/**
 * Uniswap SDK Wrapper with Decimal Safety Rails
 *
 * This wrapper provides a safe interface to the Uniswap SDK that prevents
 * the decimal miscalculation bug found in the Uniswap frontend.
 *
 * Safety Policy:
 * - All 18-decimal tokens are accepted by default
 * - Non-18 decimal tokens must be explicitly whitelisted
 * - Validates before passing to SDK
 */

import type { Address } from '../constants/common';

// ═══════════════════════════════════════════════════════════════════════════════
// WHITELISTED NON-18 DECIMAL TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

interface WhitelistedToken {
  address: Address;
  symbol: string;
  decimals: number;
  enabled: boolean;
  notes?: string;
}

/**
 * Whitelist of verified non-18 decimal tokens.
 * Only tokens in this list with enabled=true can be used in pool operations.
 */
export const WHITELISTED_NON_18_DECIMAL_TOKENS: Record<string, WhitelistedToken> = {
  // cbBTC - 8 decimals (verified working)
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': {
    address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    symbol: 'cbBTC',
    decimals: 8,
    enabled: true,
    notes: 'Coinbase Wrapped BTC - tested and verified',
  },

  // USDC - 6 decimals (DISABLED - causes frontend display bug)
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6,
    enabled: false,
    notes: 'DISABLED: Uniswap frontend displays incorrect amounts for 6-decimal tokens',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Validates token decimals according to our safety policy:
 * - 18 decimals: Always allowed
 * - Non-18 decimals: Must be in whitelist with enabled=true
 *
 * @param token - Token to validate
 * @returns Validation result with error message if invalid
 */
export function validateTokenDecimals(token: TokenInfo): ValidationResult {
  const warnings: string[] = [];

  // Validate decimals range (0-24)
  if (token.decimals < 0 || token.decimals > 24) {
    return {
      valid: false,
      error: `Invalid decimals for ${token.symbol}: ${token.decimals}. Must be 0-24.`,
    };
  }

  // 18 decimals: always allowed
  if (token.decimals === 18) {
    return { valid: true };
  }

  // Non-18 decimals: must be whitelisted
  const whitelisted = WHITELISTED_NON_18_DECIMAL_TOKENS[token.address.toLowerCase()];

  if (!whitelisted) {
    return {
      valid: false,
      error: `Token ${token.symbol} has ${token.decimals} decimals (not 18) and is not whitelisted. Only 18-decimal tokens or whitelisted tokens are allowed.`,
    };
  }

  if (!whitelisted.enabled) {
    return {
      valid: false,
      error: `Token ${token.symbol} (${token.decimals} decimals) is whitelisted but disabled. Reason: ${whitelisted.notes || 'Unknown'}`,
    };
  }

  // Verify the decimals match the whitelist
  if (whitelisted.decimals !== token.decimals) {
    return {
      valid: false,
      error: `Token ${token.symbol} decimals mismatch. Expected ${whitelisted.decimals} (from whitelist), got ${token.decimals}`,
    };
  }

  // Valid but non-standard - add warning
  warnings.push(`Using whitelisted ${token.decimals}-decimal token: ${token.symbol}`);

  return { valid: true, warnings };
}

/**
 * Validates a token pair for pool operations.
 * Both tokens must pass individual validation.
 *
 * @param token0 - First token
 * @param token1 - Second token
 * @returns Validation result
 */
export function validateTokenPair(token0: TokenInfo, token1: TokenInfo): ValidationResult {
  const allWarnings: string[] = [];

  // Validate token0
  const validation0 = validateTokenDecimals(token0);
  if (!validation0.valid) {
    return validation0;
  }
  if (validation0.warnings) {
    allWarnings.push(...validation0.warnings);
  }

  // Validate token1
  const validation1 = validateTokenDecimals(token1);
  if (!validation1.valid) {
    return validation1;
  }
  if (validation1.warnings) {
    allWarnings.push(...validation1.warnings);
  }

  // Additional pair-level checks
  if (token0.decimals !== 18 && token1.decimals !== 18) {
    allWarnings.push(
      `WARNING: Both tokens have non-standard decimals: ${token0.symbol}=${token0.decimals}, ${token1.symbol}=${token1.decimals}`
    );
  }

  return {
    valid: true,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SDK WRAPPER INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface V4PoolParams {
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  tickSpacing: number;
  hooks?: Address;
}

export interface V4LiquidityParams extends V4PoolParams {
  amount0: bigint;
  amount1: bigint;
  tickLower: number;
  tickUpper: number;
  recipient: Address;
  deadline: number;
}

export interface V4SwapParams {
  poolKey: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum: bigint;
  sqrtPriceLimitX96?: bigint;
  hookData?: `0x${string}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a V4 PoolKey with proper token ordering.
 * Validates decimals before creating the pool key.
 */
export function createPoolKey(params: V4PoolParams): { poolKey: PoolKey; validation: ValidationResult } {
  // Validate token pair
  const validation = validateTokenPair(params.token0, params.token1);

  // Log warnings
  if (validation.warnings) {
    validation.warnings.forEach(warning => console.warn(`[SDK Wrapper] ${warning}`));
  }

  // Sort tokens (V4 requires currency0 < currency1)
  const [currency0, currency1] =
    params.token0.address.toLowerCase() < params.token1.address.toLowerCase()
      ? [params.token0.address, params.token1.address]
      : [params.token1.address, params.token0.address];

  const poolKey: PoolKey = {
    currency0,
    currency1,
    fee: params.fee,
    tickSpacing: params.tickSpacing,
    hooks: params.hooks || '0x0000000000000000000000000000000000000000',
  };

  return { poolKey, validation };
}

/**
 * Formats token amount for logging with proper decimal handling.
 */
export function formatTokenAmount(amount: bigint, decimals: number, symbol: string): string {
  const value = Number(amount) / Math.pow(10, decimals);
  return `${value.toLocaleString()} ${symbol}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  WhitelistedToken,
  TokenInfo,
  ValidationResult,
  PoolKey,
  V4PoolParams,
  V4LiquidityParams,
  V4SwapParams,
};
