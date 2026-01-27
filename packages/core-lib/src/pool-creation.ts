/**
 * Pool Creation Module
 * Handles Uniswap V2/V3/V4 pool creation and liquidity provision
 */

import { FEE_TO_TICK_SPACING, BASE_RPCS_FALLBACK, RPC_TIMEOUT } from './constants.js';
import { keccak256, encodeAbiParameters, encodeFunctionData, encodePacked } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type Address = `0x${string}`;

interface Transaction {
  to: Address;
  data: string;
  value: string;
}

export interface V4CreatePoolParams {
  token0: Address;
  token1: Address;
  fee: number;
  sqrtPriceX96: bigint;
  amount0: string;
  amount1: string;
  recipient: Address;
  slippageTolerance?: number;
}

export interface V3CreatePoolParams {
  token0: Address;
  token1: Address;
  fee: number;
  sqrtPriceX96: bigint;
  amount0: string;
  amount1: string;
  recipient: Address;
  slippageTolerance?: number;
}

export interface V2CreatePoolParams {
  tokenA: Address;
  tokenB: Address;
  amountA: string;
  amountB: string;
  recipient: Address;
  slippageTolerance?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Contract Constants
// ═══════════════════════════════════════════════════════════════════════════════

// Uniswap V2
export const V2_FACTORY: Address = '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6';
export const V2_ROUTER: Address = '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24';

// Uniswap V3
export const V3_FACTORY: Address = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
export const V3_POSITION_MANAGER: Address = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';

// Uniswap V4
export const V4_POOL_MANAGER: Address = '0x498581ff718922c3f8e6a244956af099b2652b2b';
export const V4_POSITION_MANAGER: Address = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';
export const V4_STATE_VIEW: Address = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';

// Permit2 (universal across all chains)
export const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// ═══════════════════════════════════════════════════════════════════════════════
// Mathematical Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert price ratio to Q64.96 sqrt price format
 * @param price - Price as token1/token0 ratio (where token0 < token1)
 * @returns sqrtPriceX96 as bigint
 */
export function calculateSqrtPriceX96(price: number): bigint {
  // To avoid precision loss, scale price before sqrt, then adjust Q96
  // sqrt(price) * 2^96 = sqrt(price * 2^192) = sqrt(price) * 2^96
  // We can rewrite as: sqrt(price * 2^64) * 2^64 = sqrt(price) * 2^32 * 2^64 = sqrt(price) * 2^96

  const Q64 = 2n ** 64n;

  // Scale price by 2^64 before sqrt to maintain precision
  const scaledPrice = price * Number(Q64);
  const sqrtScaledPrice = Math.sqrt(scaledPrice);

  // Convert to BigInt and multiply by 2^64 to get final 2^96 scaling
  const sqrtScaledPriceBigInt = BigInt(Math.floor(sqrtScaledPrice));

  return sqrtScaledPriceBigInt * Q64;
}

/**
 * Sort tokens lexicographically (required for V3/V4)
 * @returns [token0, token1] where token0 < token1
 */
export function sortTokens(tokenA: Address, tokenB: Address): [Address, Address] {
  const addrA = tokenA.toLowerCase();
  const addrB = tokenB.toLowerCase();
  return addrA < addrB ? [tokenA, tokenB] : [tokenB, tokenA];
}

/**
 * Calculate min/max tick for a given tick spacing
 */
export function getTickRange(tickSpacing: number): { minTick: number; maxTick: number } {
  const MAX_TICK = 887272;
  const minTick = Math.ceil(-MAX_TICK / tickSpacing) * tickSpacing;
  const maxTick = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
  return { minTick, maxTick };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RPC Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

// Module-level Alchemy key for RPC calls
let _alchemyKey: string | undefined;

/**
 * Set the Alchemy API key for RPC calls
 * Call this before using pool creation functions
 */
export function setAlchemyKey(key: string | undefined): void {
  _alchemyKey = key;
}

// Reduced timeout for pool existence checks (3 seconds) - fail fast
const POOL_CHECK_TIMEOUT = 3000;

// Maximum retries - reduced to prevent long waits
const MAX_RETRIES = 1;

// Build list of RPC URLs to try (Alchemy first if available, then 1 fallback max)
function getRpcUrls(): string[] {
  const urls: string[] = [];
  if (_alchemyKey) {
    urls.push(`https://base-mainnet.g.alchemy.com/v2/${_alchemyKey}`);
  }
  // Only use first fallback to keep latency low
  if (BASE_RPCS_FALLBACK.length > 0) {
    urls.push(BASE_RPCS_FALLBACK[0]);
  }
  return urls;
}

/**
 * Check if error is transient and worth retrying
 */
function isTransientError(err: any): boolean {
  const message = err?.message?.toLowerCase() || '';
  const code = err?.code || '';
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    message.includes('aborted') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('econnreset')
  );
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rpcCall(method: string, params: any[]): Promise<any> {
  const rpcUrls = getRpcUrls();
  let lastError: any;

  // Try each RPC URL
  for (let urlIndex = 0; urlIndex < rpcUrls.length; urlIndex++) {
    const url = rpcUrls[urlIndex];

    // Retry each URL up to MAX_RETRIES times for transient errors
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), POOL_CHECK_TIMEOUT);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`RPC error: ${response.status}`);
        }

        const data = await response.json() as any;
        if (data.error) {
          throw new Error(data.error.message);
        }

        return data.result;
      } catch (err: any) {
        clearTimeout(timeout);
        lastError = err;

        // Log the error for debugging
        console.log(`[pool-creation] RPC error on ${url.includes('alchemy') ? 'Alchemy' : 'fallback'} (attempt ${attempt + 1}/${MAX_RETRIES}):`, err?.code || err?.message);

        // If it's a transient error and we have retries left, wait briefly and retry
        if (isTransientError(err) && attempt < MAX_RETRIES - 1) {
          const backoffMs = 500; // Fixed 500ms backoff for faster recovery
          await sleep(backoffMs);
          continue;
        }

        // Move to next URL if this one failed
        break;
      }
    }
  }

  // All URLs and retries exhausted
  throw lastError;
}

/**
 * Get token decimals via eth_call
 */
export async function getTokenDecimals(address: Address): Promise<number> {
  const data = '0x313ce567'; // decimals()
  const result = await rpcCall('eth_call', [{ to: address, data }, 'latest']);
  return parseInt(result, 16);
}

/**
 * Get token symbol via eth_call
 */
export async function getTokenSymbol(address: Address): Promise<string> {
  const data = '0x95d89b41'; // symbol()
  const result = await rpcCall('eth_call', [{ to: address, data }, 'latest']);

  // Decode string from bytes32 or dynamic string
  const hex = result.slice(2);
  if (hex.length === 64) {
    // bytes32 format
    return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '').trim();
  } else {
    // dynamic string format: offset(32) + length(32) + data
    const lengthHex = hex.slice(64, 128); // bytes 32-63
    const length = parseInt(lengthHex, 16);
    const dataHex = hex.slice(128, 128 + length * 2); // actual string data
    return Buffer.from(dataHex, 'hex').toString('utf8');
  }
}

/**
 * Get token name via eth_call
 */
export async function getTokenName(address: Address): Promise<string> {
  const data = '0x06fdde03'; // name()
  const result = await rpcCall('eth_call', [{ to: address, data }, 'latest']);

  // Decode dynamic string: offset(32) + length(32) + data
  const hex = result.slice(2);
  if (hex.length === 64) {
    // bytes32 format (rare for name)
    return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '').trim();
  } else {
    const lengthHex = hex.slice(64, 128);
    const length = parseInt(lengthHex, 16);
    const dataHex = hex.slice(128, 128 + length * 2);
    return Buffer.from(dataHex, 'hex').toString('utf8');
  }
}

/**
 * Get ERC20 allowance
 */
export async function getTokenAllowance(
  token: Address,
  owner: Address,
  spender: Address
): Promise<bigint> {
  // allowance(address,address)
  const data = '0xdd62ed3e' +
    owner.slice(2).padStart(64, '0') +
    spender.slice(2).padStart(64, '0');

  const result = await rpcCall('eth_call', [{ to: token, data }, 'latest']);
  return BigInt(result);
}

/**
 * Check if V2 pool exists
 */
export async function checkV2PoolExists(
  token0: Address,
  token1: Address
): Promise<{ exists: boolean; pair?: Address }> {
  // getPair(address,address) selector: 0xe6a43905
  const data = '0xe6a43905' +
    token0.slice(2).padStart(64, '0') +
    token1.slice(2).padStart(64, '0');

  try {
    const result = await rpcCall('eth_call', [{ to: V2_FACTORY, data }, 'latest']);
    const pairAddress = ('0x' + result.slice(-40)) as Address;

    // Zero address means doesn't exist
    const exists = pairAddress !== '0x0000000000000000000000000000000000000000';
    return exists ? { exists: true, pair: pairAddress } : { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Check if V3 pool exists
 */
export async function checkV3PoolExists(
  token0: Address,
  token1: Address,
  fee: number
): Promise<{ exists: boolean; pool?: Address }> {
  // getPool(address,address,uint24) selector: 0x1698ee82
  const data = '0x1698ee82' +
    token0.slice(2).padStart(64, '0') +
    token1.slice(2).padStart(64, '0') +
    fee.toString(16).padStart(64, '0');

  try {
    const result = await rpcCall('eth_call', [{ to: V3_FACTORY, data }, 'latest']);
    const poolAddress = ('0x' + result.slice(-40)) as Address;

    const exists = poolAddress !== '0x0000000000000000000000000000000000000000';
    return exists ? { exists: true, pool: poolAddress } : { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Check if V4 pool exists (via StateView getSlot0)
 */
export async function checkV4PoolExists(
  token0: Address,
  token1: Address,
  fee: number,
  tickSpacing: number
): Promise<{ exists: boolean; initialized: boolean; sqrtPriceX96?: string; tick?: number }> {
  // Calculate poolId = keccak256(abi.encode(poolKey))
  const poolKeyEncoded =
    token0.slice(2).toLowerCase().padStart(64, '0') +
    token1.slice(2).toLowerCase().padStart(64, '0') +
    fee.toString(16).padStart(64, '0') +
    tickSpacing.toString(16).padStart(64, '0') +
    '0000000000000000000000000000000000000000000000000000000000000000'; // hooks = 0x0

  // Calculate poolId hash
  const poolId = keccak256(`0x${poolKeyEncoded}` as `0x${string}`);

  console.log('[checkV4PoolExists] Checking pool:', { token0, token1, fee, tickSpacing, poolId });

  // getSlot0(bytes32) selector: 0xc815641c
  const data = '0xc815641c' + poolId.slice(2);

  try {
    const result = await rpcCall('eth_call', [{ to: V4_STATE_VIEW, data }, 'latest']);

    console.log('[checkV4PoolExists] RPC result:', result?.slice(0, 140) + '...');

    // Decode sqrtPriceX96 (first 32 bytes) and tick (next 32 bytes)
    const sqrtPriceX96Hex = result.slice(2, 66);
    const sqrtPriceX96 = BigInt('0x' + sqrtPriceX96Hex);

    // Decode tick (int24, but stored in 32 bytes)
    const tickHex = result.slice(66, 130);
    const tickBigInt = BigInt('0x' + tickHex);
    // Handle signed int24
    const tick = tickBigInt > BigInt('0x7fffff')
      ? Number(tickBigInt - BigInt('0x1000000'))
      : Number(tickBigInt);

    const initialized = sqrtPriceX96 > 0n;

    console.log('[checkV4PoolExists] Pool state:', {
      initialized,
      sqrtPriceX96: sqrtPriceX96.toString().slice(0, 20) + '...',
      tick
    });

    return { exists: initialized, initialized, sqrtPriceX96: sqrtPriceX96.toString(), tick };
  } catch (err: any) {
    console.error('[checkV4PoolExists] RPC error:', err?.message || err);
    return { exists: false, initialized: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Approval Transactions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build ERC20 approval transaction
 */
export function buildApproveTransaction(token: Address, spender: Address): Transaction {
  // approve(address,uint256) - max uint256
  const data = '0x095ea7b3' +
    spender.slice(2).padStart(64, '0') +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

  return {
    to: token,
    data,
    value: '0',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Permit2 Functions (for V4)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get Permit2 allowance for a token/spender pair
 * Returns { amount, expiration, nonce }
 */
export async function getPermit2Allowance(
  token: Address,
  owner: Address,
  spender: Address
): Promise<{ amount: bigint; expiration: number; nonce: number }> {
  // allowance(address owner, address token, address spender) returns (uint160 amount, uint48 expiration, uint48 nonce)
  const data = '0x927da105' +
    owner.slice(2).padStart(64, '0') +
    token.slice(2).padStart(64, '0') +
    spender.slice(2).padStart(64, '0');

  try {
    const result = await rpcCall('eth_call', [{ to: PERMIT2, data }, 'latest']);
    // Result is packed: amount (160 bits) + expiration (48 bits) + nonce (48 bits) = 256 bits total
    // But returned as 3 separate 32-byte words
    const amount = BigInt('0x' + result.slice(2, 66));
    const expiration = parseInt(result.slice(66, 130), 16);
    const nonce = parseInt(result.slice(130, 194), 16);
    return { amount, expiration, nonce };
  } catch (error) {
    console.error('[Permit2] Error getting allowance:', error);
    return { amount: 0n, expiration: 0, nonce: 0 };
  }
}

/**
 * Build Permit2 approve transaction
 * This grants a spender permission to use Permit2 to transfer tokens
 */
export function buildPermit2ApproveTransaction(
  token: Address,
  spender: Address,
  amount?: bigint,
  expiration?: number
): Transaction {
  // approve(address token, address spender, uint160 amount, uint48 expiration)
  // selector: 0x87517c45
  const amountHex = (amount ?? BigInt('0xffffffffffffffffffffffffffffffffffffffff')).toString(16).padStart(64, '0');
  // Default expiration: ~136 years from now (max uint48)
  const expirationHex = (expiration ?? 0xffffffffffff).toString(16).padStart(64, '0');

  const data = '0x87517c45' +
    token.slice(2).padStart(64, '0') +
    spender.slice(2).padStart(64, '0') +
    amountHex +
    expirationHex;

  return {
    to: PERMIT2,
    data,
    value: '0',
  };
}

/**
 * Check if V4 approvals are set up correctly
 * V4 requires: token -> Permit2 (ERC20 approve) AND Permit2 -> V4_PM (Permit2.approve)
 */
export async function checkV4Approvals(
  token: Address,
  owner: Address,
  amountRequired: bigint
): Promise<{
  erc20ToPermit2: boolean;
  permit2ToV4PM: boolean;
  needsErc20Approval: boolean;
  needsPermit2Approval: boolean;
}> {
  try {
    // Check ERC20 allowance to Permit2
    const erc20Allowance = await getTokenAllowance(token, owner, PERMIT2);
    const erc20ToPermit2 = erc20Allowance >= amountRequired;

    // Check Permit2 allowance to V4 Position Manager
    const permit2Allowance = await getPermit2Allowance(token, owner, V4_POSITION_MANAGER);
    const now = Math.floor(Date.now() / 1000);
    const permit2ToV4PM = permit2Allowance.amount >= amountRequired && permit2Allowance.expiration > now;

    return {
      erc20ToPermit2,
      permit2ToV4PM,
      needsErc20Approval: !erc20ToPermit2,
      needsPermit2Approval: !permit2ToV4PM,
    };
  } catch (error) {
    console.error('[V4 Approvals] Error checking:', error);
    // If we can't check, assume approvals are needed
    return {
      erc20ToPermit2: false,
      permit2ToV4PM: false,
      needsErc20Approval: true,
      needsPermit2Approval: true,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// V4 Pool Creation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build V4 pool initialization transaction
 * Calls PoolManager.initialize(PoolKey, uint160 sqrtPriceX96)
 */
export function buildV4InitializePoolTransaction(params: V4CreatePoolParams): Transaction {
  const tickSpacing = FEE_TO_TICK_SPACING[params.fee];
  if (!tickSpacing) {
    throw new Error(`Invalid V4 fee tier: ${params.fee}`);
  }

  // PoolKey struct
  const poolKey = {
    currency0: params.token0,
    currency1: params.token1,
    fee: params.fee,
    tickSpacing: tickSpacing,
    hooks: '0x0000000000000000000000000000000000000000' as Address,
  };

  // Use viem to properly encode the function call
  const data = encodeFunctionData({
    abi: [{
      name: 'initialize',
      type: 'function',
      inputs: [
        {
          name: 'key',
          type: 'tuple',
          components: [
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'hooks', type: 'address' },
          ],
        },
        { name: 'sqrtPriceX96', type: 'uint160' },
      ],
      outputs: [{ type: 'int24' }],
    }],
    functionName: 'initialize',
    args: [poolKey, params.sqrtPriceX96],
  });

  console.log('[V4 Init] Built initialization for pool:', poolKey);
  console.log('[V4 Init] sqrtPriceX96:', params.sqrtPriceX96.toString());

  return {
    to: V4_POOL_MANAGER,
    data,
    value: '0',
  };
}

// V4 Position Manager Action Codes (from Uniswap v4-periphery Actions.sol)
const V4_ACTIONS = {
  // Pool liquidity actions
  INCREASE_LIQUIDITY: 0x00,
  DECREASE_LIQUIDITY: 0x01,
  MINT_POSITION: 0x02,
  BURN_POSITION: 0x03,
  // Delta resolving actions
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  SETTLE_PAIR: 0x0d,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
  TAKE_PAIR: 0x11,
  CLOSE_CURRENCY: 0x12,
  CLEAR_OR_TAKE: 0x13,
  SWEEP: 0x14,
} as const;

// ABI types for V4 encoding
const POOL_KEY_ABI = {
  components: [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
  ],
  type: 'tuple',
} as const;

/**
 * Calculate liquidity from amounts and sqrtPriceX96 for full-range position
 * For a full-range position, liquidity is approximately:
 * L = min(amount0 * sqrtPrice / 2^96, amount1 * 2^96 / sqrtPrice)
 */
function calculateLiquidityFromAmounts(
  amount0: bigint,
  amount1: bigint,
  sqrtPriceX96: bigint
): bigint {
  const Q96 = 2n ** 96n;

  // Calculate liquidity from each token
  // L0 = amount0 * sqrtPrice (in Q96 terms)
  // L1 = amount1 / sqrtPrice (in Q96 terms)
  const liquidityFrom0 = (amount0 * sqrtPriceX96) / Q96;
  const liquidityFrom1 = (amount1 * Q96) / sqrtPriceX96;

  // Use the smaller value to ensure we don't exceed either amount
  const liquidity = liquidityFrom0 < liquidityFrom1 ? liquidityFrom0 : liquidityFrom1;

  // Ensure we have non-zero liquidity
  return liquidity > 0n ? liquidity : 1n;
}

/**
 * Encode mint position params for V4 Position Manager
 * Uses viem's encodeAbiParameters for correct ABI encoding including:
 * - Proper int24 sign extension (negative ticks)
 * - Correct dynamic bytes offset calculation
 * - Standard padding and alignment
 *
 * The CalldataDecoder reads these fields in flat layout:
 *   0x00: currency0 (address)
 *   0x20: currency1 (address)
 *   0x40: fee (uint24)
 *   0x60: tickSpacing (int24)
 *   0x80: hooks (address)
 *   0xA0: tickLower (int24)
 *   0xC0: tickUpper (int24)
 *   0xE0: liquidity (uint256)
 *   0x100: amount0Max (uint128)
 *   0x120: amount1Max (uint128)
 *   0x140: owner (address)
 *   0x160: hookData offset -> points to 0x180
 *   0x180: hookData length + data
 */
function encodeMintParams(
  poolKey: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address },
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
  amount0Max: bigint,
  amount1Max: bigint,
  owner: Address,
  hookData: `0x${string}`
): `0x${string}` {
  return encodeAbiParameters(
    [
      { name: 'currency0', type: 'address' },
      { name: 'currency1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickSpacing', type: 'int24' },
      { name: 'hooks', type: 'address' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amount0Max', type: 'uint128' },
      { name: 'amount1Max', type: 'uint128' },
      { name: 'owner', type: 'address' },
      { name: 'hookData', type: 'bytes' },
    ],
    [
      poolKey.currency0,
      poolKey.currency1,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
      tickLower,
      tickUpper,
      liquidity,
      amount0Max,
      amount1Max,
      owner,
      hookData,
    ]
  );
}

/**
 * Build V4 mint position transaction (full range)
 * Uses modifyLiquidities with MINT_POSITION + SETTLE_PAIR actions
 */
export function buildV4MintPositionTransaction(params: V4CreatePoolParams): Transaction {
  const tickSpacing = FEE_TO_TICK_SPACING[params.fee];
  if (!tickSpacing) {
    throw new Error(`Invalid V4 fee tier: ${params.fee}`);
  }

  const { minTick, maxTick } = getTickRange(tickSpacing);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const amount0 = BigInt(params.amount0);
  const amount1 = BigInt(params.amount1);

  // Calculate liquidity from amounts
  const liquidity = calculateLiquidityFromAmounts(amount0, amount1, params.sqrtPriceX96);

  console.log('[V4 Mint] Calculated liquidity:', liquidity.toString(), 'from amounts:', amount0.toString(), amount1.toString());

  // PoolKey struct
  const poolKey = {
    currency0: params.token0,
    currency1: params.token1,
    fee: params.fee,
    tickSpacing: tickSpacing,
    hooks: '0x0000000000000000000000000000000000000000' as Address,
  };

  // Encode MINT_POSITION params with V4's expected format (relative hookData offset)
  const mintParams = encodeMintParams(
    poolKey,
    minTick,
    maxTick,
    liquidity,
    amount0,  // amount0Max
    amount1,  // amount1Max
    params.recipient,
    '0x' as `0x${string}`,  // empty hookData
  );

  // Encode CLOSE_CURRENCY params for each token
  // CLOSE_CURRENCY checks the delta and uses Permit2 to transfer tokens from user if needed
  // Format: abi.encode(Currency) = just the address
  const closeCurrency0Params = encodeAbiParameters(
    [{ type: 'address' }],
    [params.token0]
  );
  const closeCurrency1Params = encodeAbiParameters(
    [{ type: 'address' }],
    [params.token1]
  );

  // Actions as packed bytes: [MINT_POSITION, CLOSE_CURRENCY, CLOSE_CURRENCY]
  // MINT creates negative deltas, CLOSE_CURRENCY settles each token via Permit2
  const actions = encodePacked(
    ['uint8', 'uint8', 'uint8'],
    [V4_ACTIONS.MINT_POSITION, V4_ACTIONS.CLOSE_CURRENCY, V4_ACTIONS.CLOSE_CURRENCY]
  );

  // Encode unlockData as: abi.encode(bytes actions, bytes[] params)
  const unlockData = encodeAbiParameters(
    [
      { type: 'bytes' },
      { type: 'bytes[]' },
    ],
    [actions, [mintParams, closeCurrency0Params, closeCurrency1Params]]
  );

  // Encode modifyLiquidities call
  const data = encodeFunctionData({
    abi: [{
      name: 'modifyLiquidities',
      type: 'function',
      inputs: [
        { name: 'unlockData', type: 'bytes' },
        { name: 'deadline', type: 'uint256' },
      ],
      outputs: [],
    }],
    functionName: 'modifyLiquidities',
    args: [unlockData, deadline],
  });

  console.log('[V4 Mint] Built transaction to:', V4_POSITION_MANAGER);
  console.log('[V4 Mint] PoolKey:', poolKey);
  console.log('[V4 Mint] Tick range:', minTick, 'to', maxTick);
  console.log('[V4 Mint] MintParams length:', mintParams.length);

  return {
    to: V4_POSITION_MANAGER,
    data,
    value: '0',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// V3 Pool Creation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build V3 pool initialization transaction
 */
export function buildV3InitializePoolTransaction(params: V3CreatePoolParams): Transaction {
  // createAndInitializePoolIfNecessary(address,address,uint24,uint160)
  // selector: 0x13ead562
  const sqrtPriceHex = params.sqrtPriceX96.toString(16).padStart(64, '0');

  const data = '0x13ead562' +
    params.token0.slice(2).padStart(64, '0') +
    params.token1.slice(2).padStart(64, '0') +
    params.fee.toString(16).padStart(64, '0') +
    sqrtPriceHex;

  return {
    to: V3_POSITION_MANAGER,
    data,
    value: '0',
  };
}

/**
 * Build V3 mint position transaction (full range)
 */
export function buildV3MintPositionTransaction(params: V3CreatePoolParams): Transaction {
  const tickSpacing = FEE_TO_TICK_SPACING[params.fee] || 60;
  const { minTick, maxTick } = getTickRange(tickSpacing);

  const slippage = params.slippageTolerance || 0.5;
  const slippageMultiplier = 1 - (slippage / 100);

  const amount0Min = BigInt(Math.floor(Number(params.amount0) * slippageMultiplier));
  const amount1Min = BigInt(Math.floor(Number(params.amount1) * slippageMultiplier));
  const deadline = Math.floor(Date.now() / 1000) + 1200;

  // MintParams struct
  // mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))
  // selector: 0x88316456
  const tickLowerHex = (minTick < 0 ? (BigInt(minTick) + (1n << 256n)) : BigInt(minTick)).toString(16).padStart(64, '0');
  const tickUpperHex = BigInt(maxTick).toString(16).padStart(64, '0');

  const data = '0x88316456' +
    '0000000000000000000000000000000000000000000000000000000000000020' + // offset to struct
    params.token0.slice(2).padStart(64, '0') +
    params.token1.slice(2).padStart(64, '0') +
    params.fee.toString(16).padStart(64, '0') +
    tickLowerHex +
    tickUpperHex +
    BigInt(params.amount0).toString(16).padStart(64, '0') + // amount0Desired
    BigInt(params.amount1).toString(16).padStart(64, '0') + // amount1Desired
    amount0Min.toString(16).padStart(64, '0') +
    amount1Min.toString(16).padStart(64, '0') +
    params.recipient.slice(2).padStart(64, '0') +
    deadline.toString(16).padStart(64, '0');

  return {
    to: V3_POSITION_MANAGER,
    data,
    value: '0',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Pool Creation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build V2 create pool & add liquidity transaction
 */
export function buildV2CreatePoolTransaction(params: V2CreatePoolParams): Transaction {
  const slippage = params.slippageTolerance || 0.5;
  const slippageMultiplier = 1 - (slippage / 100);

  const amountAMin = BigInt(Math.floor(Number(params.amountA) * slippageMultiplier));
  const amountBMin = BigInt(Math.floor(Number(params.amountB) * slippageMultiplier));
  const deadline = Math.floor(Date.now() / 1000) + 1200;

  // addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)
  // selector: 0xe8e33700
  const data = '0xe8e33700' +
    params.tokenA.slice(2).padStart(64, '0') +
    params.tokenB.slice(2).padStart(64, '0') +
    BigInt(params.amountA).toString(16).padStart(64, '0') +
    BigInt(params.amountB).toString(16).padStart(64, '0') +
    amountAMin.toString(16).padStart(64, '0') +
    amountBMin.toString(16).padStart(64, '0') +
    params.recipient.slice(2).padStart(64, '0') +
    deadline.toString(16).padStart(64, '0');

  return {
    to: V2_ROUTER,
    data,
    value: '0',
  };
}
