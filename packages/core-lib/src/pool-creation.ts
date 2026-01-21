/**
 * Pool Creation Module
 * Handles Uniswap V2/V3/V4 pool creation and liquidity provision
 */

import { FEE_TO_TICK_SPACING, BASE_RPCS_FALLBACK, RPC_TIMEOUT } from './constants.js';

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
export const V4_STATE_VIEW: Address = '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6';

// ═══════════════════════════════════════════════════════════════════════════════
// Mathematical Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert price ratio to Q64.96 sqrt price format
 * @param price - Price as token1/token0 ratio (where token0 < token1)
 * @returns sqrtPriceX96 as bigint
 */
export function calculateSqrtPriceX96(price: number): bigint {
  const sqrtPrice = Math.sqrt(price);
  const Q96 = 2n ** 96n;
  return BigInt(Math.floor(sqrtPrice * Number(Q96)));
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

let rpcUrl = BASE_RPCS_FALLBACK[0];
let rpcIndex = 0;

async function rpcCall(method: string, params: any[]): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT);

  try {
    const response = await fetch(rpcUrl, {
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
  } catch (err) {
    clearTimeout(timeout);
    // Fallback to next RPC
    rpcIndex = (rpcIndex + 1) % BASE_RPCS_FALLBACK.length;
    rpcUrl = BASE_RPCS_FALLBACK[rpcIndex];
    throw err;
  }
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
    return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
  } else {
    // dynamic string format - skip offset + length
    const strHex = hex.slice(128);
    return Buffer.from(strHex, 'hex').toString('utf8').replace(/\0/g, '');
  }
}

/**
 * Get token name via eth_call
 */
export async function getTokenName(address: Address): Promise<string> {
  const data = '0x06fdde03'; // name()
  const result = await rpcCall('eth_call', [{ to: address, data }, 'latest']);

  // Decode dynamic string
  const hex = result.slice(2);
  const strHex = hex.slice(128);
  return Buffer.from(strHex, 'hex').toString('utf8').replace(/\0/g, '');
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
  // Encode PoolKey struct
  const poolKey =
    token0.slice(2).padStart(64, '0') +
    token1.slice(2).padStart(64, '0') +
    fee.toString(16).padStart(64, '0') +
    tickSpacing.toString(16).padStart(64, '0') +
    '0000000000000000000000000000000000000000000000000000000000000000'; // hooks = 0x0

  // getSlot0(PoolKey) selector: 0x3850c7bd
  const data = '0x3850c7bd' +
    '0000000000000000000000000000000000000000000000000000000000000020' + // offset
    poolKey;

  try {
    const result = await rpcCall('eth_call', [{ to: V4_STATE_VIEW, data }, 'latest']);

    // Decode sqrtPriceX96 (first 32 bytes after offset)
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
 */
export function buildV4InitializePoolTransaction(params: V4CreatePoolParams): Transaction {
  const tickSpacing = FEE_TO_TICK_SPACING[params.fee];
  if (!tickSpacing) {
    throw new Error(`Invalid V4 fee tier: ${params.fee}`);
  }

  // PoolKey struct
  const poolKey =
    params.token0.slice(2).padStart(64, '0') +
    params.token1.slice(2).padStart(64, '0') +
    params.fee.toString(16).padStart(64, '0') +
    tickSpacing.toString(16).padStart(64, '0') +
    '0000000000000000000000000000000000000000000000000000000000000000'; // hooks = 0x0

  // initialize(PoolKey,uint160) selector: 0x16569d93
  const sqrtPriceHex = params.sqrtPriceX96.toString(16).padStart(64, '0');

  const data = '0x16569d93' +
    '0000000000000000000000000000000000000000000000000000000000000040' + // PoolKey offset
    sqrtPriceHex +
    poolKey;

  return {
    to: V4_POOL_MANAGER,
    data,
    value: '0',
  };
}

/**
 * Build V4 mint position transaction (full range)
 */
export function buildV4MintPositionTransaction(params: V4CreatePoolParams): Transaction {
  const tickSpacing = FEE_TO_TICK_SPACING[params.fee];
  const { minTick, maxTick } = getTickRange(tickSpacing);

  const slippage = params.slippageTolerance || 0.5;
  const slippageMultiplier = 1 - (slippage / 100);

  const amount0Min = BigInt(Math.floor(Number(params.amount0) * slippageMultiplier)).toString(16).padStart(64, '0');
  const amount1Min = BigInt(Math.floor(Number(params.amount1) * slippageMultiplier)).toString(16).padStart(64, '0');

  // PoolKey
  const poolKey =
    params.token0.slice(2).padStart(64, '0') +
    params.token1.slice(2).padStart(64, '0') +
    params.fee.toString(16).padStart(64, '0') +
    tickSpacing.toString(16).padStart(64, '0') +
    '0000000000000000000000000000000000000000000000000000000000000000';

  // MintParams struct
  const tickLowerHex = (minTick < 0 ? (0x100000000 + minTick) : minTick).toString(16).padStart(64, '0');
  const tickUpperHex = maxTick.toString(16).padStart(64, '0');
  const liquidityHex = BigInt(params.amount0).toString(16).padStart(64, '0');

  // modifyLiquidities(bytes,uint256) selector: 0x8436b6f5
  // Using simplified approach - encode mint action
  const mintAction = '0x8436b6f5' +
    '0000000000000000000000000000000000000000000000000000000000000040' + // offset to actions
    Math.floor(Date.now() / 1000 + 1200).toString(16).padStart(64, '0') + // deadline
    '0000000000000000000000000000000000000000000000000000000000000001' + // actions length
    poolKey +
    tickLowerHex +
    tickUpperHex +
    liquidityHex +
    amount0Min +
    amount1Min +
    params.recipient.slice(2).padStart(64, '0') +
    '0000000000000000000000000000000000000000000000000000000000000000'; // hookData

  return {
    to: V4_POSITION_MANAGER,
    data: mintAction,
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
