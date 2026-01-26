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
): Promise<{ exists: boolean; initialized: boolean }> {
  // Calculate poolId = keccak256(abi.encode(poolKey))
  const poolKeyEncoded =
    token0.slice(2).toLowerCase().padStart(64, '0') +
    token1.slice(2).toLowerCase().padStart(64, '0') +
    fee.toString(16).padStart(64, '0') +
    tickSpacing.toString(16).padStart(64, '0') +
    '0000000000000000000000000000000000000000000000000000000000000000'; // hooks = 0x0

  // Calculate poolId hash
  const poolId = keccak256(`0x${poolKeyEncoded}` as `0x${string}`);

  // getSlot0(bytes32) selector: 0x98e5b12a
  const data = '0x98e5b12a' + poolId.slice(2);

  try {
    const result = await rpcCall('eth_call', [{ to: V4_STATE_VIEW, data }, 'latest']);

    // Decode sqrtPriceX96 (first 32 bytes)
    const sqrtPriceX96Hex = result.slice(2, 66);
    const sqrtPriceX96 = BigInt('0x' + sqrtPriceX96Hex);

    const initialized = sqrtPriceX96 > 0n;
    return { exists: initialized, initialized };
  } catch {
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
  MINT_POSITION: 0x00,
  INCREASE_LIQUIDITY: 0x01,
  DECREASE_LIQUIDITY: 0x02,
  BURN_POSITION: 0x03,
  // Delta resolving actions
  SETTLE_PAIR: 0x10,
  TAKE_PAIR: 0x11,
  SETTLE: 0x12,
  TAKE: 0x13,
  CLOSE_CURRENCY: 0x14,
  CLEAR_OR_TAKE: 0x15,
  SWEEP: 0x16,
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
 * Encode int24 as a 32-byte hex string (signed)
 */
function encodeInt24(value: number): string {
  // Handle negative numbers with two's complement
  const unsigned = value < 0 ? (0x1000000 + value) : value;
  return unsigned.toString(16).padStart(64, '0');
}

/**
 * Encode mint position params for V4 Position Manager
 * V4 uses a packed encoding where the hookData offset is relative to its field position
 * Format: PoolKey(160) + tickLower(32) + tickUpper(32) + liquidity(32) + amount0Max(32) + amount1Max(32) + owner(32) + hookDataOffset(32) + hookDataLength(32)
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
  // PoolKey: 5 x 32 bytes = 160 bytes
  const poolKeyEncoded =
    poolKey.currency0.slice(2).toLowerCase().padStart(64, '0') +
    poolKey.currency1.slice(2).toLowerCase().padStart(64, '0') +
    poolKey.fee.toString(16).padStart(64, '0') +
    encodeInt24(poolKey.tickSpacing) +
    poolKey.hooks.slice(2).toLowerCase().padStart(64, '0');

  // Fixed fields after PoolKey
  const tickLowerEncoded = encodeInt24(tickLower);
  const tickUpperEncoded = encodeInt24(tickUpper);
  const liquidityEncoded = liquidity.toString(16).padStart(64, '0');
  const amount0MaxEncoded = amount0Max.toString(16).padStart(64, '0');
  const amount1MaxEncoded = amount1Max.toString(16).padStart(64, '0');
  const ownerEncoded = owner.slice(2).toLowerCase().padStart(64, '0');

  // hookData: For V4's CalldataDecoder.toBytes, the offset at position 0x160 must be RELATIVE
  // to that position. If hookData length is at 0x180 (32 bytes after offset field),
  // the relative offset should be 0x20 (32).
  const hookDataOffset = '0000000000000000000000000000000000000000000000000000000000000020'; // 32 in hex

  // hookData: length (32 bytes) + actual data
  const hookDataHex = hookData.slice(2); // remove 0x prefix
  const hookDataLength = (hookDataHex.length / 2).toString(16).padStart(64, '0');
  const hookDataPadded = hookDataHex.padEnd(Math.ceil(hookDataHex.length / 64) * 64, '0');

  return `0x${poolKeyEncoded}${tickLowerEncoded}${tickUpperEncoded}${liquidityEncoded}${amount0MaxEncoded}${amount1MaxEncoded}${ownerEncoded}${hookDataOffset}${hookDataLength}${hookDataPadded}` as `0x${string}`;
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

  // Encode SETTLE_PAIR params: (Currency currency0, Currency currency1)
  const settleParams = encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'address' },
    ],
    [params.token0, params.token1]
  );

  // Actions as packed bytes: [MINT_POSITION, SETTLE_PAIR]
  const actions = encodePacked(
    ['uint8', 'uint8'],
    [V4_ACTIONS.MINT_POSITION, V4_ACTIONS.SETTLE_PAIR]
  );

  // Encode unlockData as: abi.encode(bytes actions, bytes[] params)
  const unlockData = encodeAbiParameters(
    [
      { type: 'bytes' },
      { type: 'bytes[]' },
    ],
    [actions, [mintParams, settleParams]]
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
  const tickLowerHex = (minTick < 0 ? (BigInt(minTick) + BigInt('0x100000000000000000000000000000000000000000000000000000000000000')) : BigInt(minTick)).toString(16).padStart(64, '0');
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
