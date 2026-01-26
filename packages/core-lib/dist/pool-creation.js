/**
 * Pool Creation Module
 * Handles Uniswap V2/V3/V4 pool creation and liquidity provision
 */
import { FEE_TO_TICK_SPACING, BASE_RPCS_FALLBACK } from './constants.js';
import { keccak256 } from 'viem';
// ═══════════════════════════════════════════════════════════════════════════════
// Contract Constants
// ═══════════════════════════════════════════════════════════════════════════════
// Uniswap V2
export const V2_FACTORY = '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6';
export const V2_ROUTER = '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24';
// Uniswap V3
export const V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
export const V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
// Uniswap V4
export const V4_POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b';
export const V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';
export const V4_STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';
// ═══════════════════════════════════════════════════════════════════════════════
// Mathematical Utilities
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Convert price ratio to Q64.96 sqrt price format
 * @param price - Price as token1/token0 ratio (where token0 < token1)
 * @returns sqrtPriceX96 as bigint
 */
export function calculateSqrtPriceX96(price) {
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
export function sortTokens(tokenA, tokenB) {
    const addrA = tokenA.toLowerCase();
    const addrB = tokenB.toLowerCase();
    return addrA < addrB ? [tokenA, tokenB] : [tokenB, tokenA];
}
/**
 * Calculate min/max tick for a given tick spacing
 */
export function getTickRange(tickSpacing) {
    const MAX_TICK = 887272;
    const minTick = Math.ceil(-MAX_TICK / tickSpacing) * tickSpacing;
    const maxTick = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
    return { minTick, maxTick };
}
// ═══════════════════════════════════════════════════════════════════════════════
// RPC Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════
// Module-level Alchemy key for RPC calls
let _alchemyKey;
/**
 * Set the Alchemy API key for RPC calls
 * Call this before using pool creation functions
 */
export function setAlchemyKey(key) {
    _alchemyKey = key;
}
// Extended timeout for pool existence checks (8 seconds)
const POOL_CHECK_TIMEOUT = 8000;
// Maximum retries for transient errors
const MAX_RETRIES = 3;
// Build list of RPC URLs to try (Alchemy first if available, then fallbacks)
function getRpcUrls() {
    const urls = [];
    if (_alchemyKey) {
        urls.push(`https://base-mainnet.g.alchemy.com/v2/${_alchemyKey}`);
    }
    urls.push(...BASE_RPCS_FALLBACK);
    return urls;
}
/**
 * Check if error is transient and worth retrying
 */
function isTransientError(err) {
    const message = err?.message?.toLowerCase() || '';
    const code = err?.code || '';
    return (code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND' ||
        message.includes('aborted') ||
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('fetch failed') ||
        message.includes('econnreset'));
}
/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function rpcCall(method, params) {
    const rpcUrls = getRpcUrls();
    let lastError;
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
                const data = await response.json();
                if (data.error) {
                    throw new Error(data.error.message);
                }
                return data.result;
            }
            catch (err) {
                clearTimeout(timeout);
                lastError = err;
                // Log the error for debugging
                console.log(`[pool-creation] RPC error on ${url.includes('alchemy') ? 'Alchemy' : 'fallback'} (attempt ${attempt + 1}/${MAX_RETRIES}):`, err?.code || err?.message);
                // If it's a transient error and we have retries left, wait and retry
                if (isTransientError(err) && attempt < MAX_RETRIES - 1) {
                    const backoffMs = Math.min(1000 * Math.pow(2, attempt), 4000); // 1s, 2s, 4s
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
export async function getTokenDecimals(address) {
    const data = '0x313ce567'; // decimals()
    const result = await rpcCall('eth_call', [{ to: address, data }, 'latest']);
    return parseInt(result, 16);
}
/**
 * Get token symbol via eth_call
 */
export async function getTokenSymbol(address) {
    const data = '0x95d89b41'; // symbol()
    const result = await rpcCall('eth_call', [{ to: address, data }, 'latest']);
    // Decode string from bytes32 or dynamic string
    const hex = result.slice(2);
    if (hex.length === 64) {
        // bytes32 format
        return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    else {
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
export async function getTokenName(address) {
    const data = '0x06fdde03'; // name()
    const result = await rpcCall('eth_call', [{ to: address, data }, 'latest']);
    // Decode dynamic string: offset(32) + length(32) + data
    const hex = result.slice(2);
    if (hex.length === 64) {
        // bytes32 format (rare for name)
        return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '').trim();
    }
    else {
        const lengthHex = hex.slice(64, 128);
        const length = parseInt(lengthHex, 16);
        const dataHex = hex.slice(128, 128 + length * 2);
        return Buffer.from(dataHex, 'hex').toString('utf8');
    }
}
/**
 * Get ERC20 allowance
 */
export async function getTokenAllowance(token, owner, spender) {
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
export async function checkV2PoolExists(token0, token1) {
    // getPair(address,address) selector: 0xe6a43905
    const data = '0xe6a43905' +
        token0.slice(2).padStart(64, '0') +
        token1.slice(2).padStart(64, '0');
    try {
        const result = await rpcCall('eth_call', [{ to: V2_FACTORY, data }, 'latest']);
        const pairAddress = ('0x' + result.slice(-40));
        // Zero address means doesn't exist
        const exists = pairAddress !== '0x0000000000000000000000000000000000000000';
        return exists ? { exists: true, pair: pairAddress } : { exists: false };
    }
    catch {
        return { exists: false };
    }
}
/**
 * Check if V3 pool exists
 */
export async function checkV3PoolExists(token0, token1, fee) {
    // getPool(address,address,uint24) selector: 0x1698ee82
    const data = '0x1698ee82' +
        token0.slice(2).padStart(64, '0') +
        token1.slice(2).padStart(64, '0') +
        fee.toString(16).padStart(64, '0');
    try {
        const result = await rpcCall('eth_call', [{ to: V3_FACTORY, data }, 'latest']);
        const poolAddress = ('0x' + result.slice(-40));
        const exists = poolAddress !== '0x0000000000000000000000000000000000000000';
        return exists ? { exists: true, pool: poolAddress } : { exists: false };
    }
    catch {
        return { exists: false };
    }
}
/**
 * Check if V4 pool exists (via StateView getSlot0)
 */
export async function checkV4PoolExists(token0, token1, fee, tickSpacing) {
    // Calculate poolId = keccak256(abi.encode(poolKey))
    const poolKeyEncoded = token0.slice(2).toLowerCase().padStart(64, '0') +
        token1.slice(2).toLowerCase().padStart(64, '0') +
        fee.toString(16).padStart(64, '0') +
        tickSpacing.toString(16).padStart(64, '0') +
        '0000000000000000000000000000000000000000000000000000000000000000'; // hooks = 0x0
    // Calculate poolId hash
    const poolId = keccak256(`0x${poolKeyEncoded}`);
    // getSlot0(bytes32) selector: 0x98e5b12a
    const data = '0x98e5b12a' + poolId.slice(2);
    try {
        const result = await rpcCall('eth_call', [{ to: V4_STATE_VIEW, data }, 'latest']);
        // Decode sqrtPriceX96 (first 32 bytes)
        const sqrtPriceX96Hex = result.slice(2, 66);
        const sqrtPriceX96 = BigInt('0x' + sqrtPriceX96Hex);
        const initialized = sqrtPriceX96 > 0n;
        return { exists: initialized, initialized };
    }
    catch {
        return { exists: false, initialized: false };
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// Approval Transactions
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Build ERC20 approval transaction
 */
export function buildApproveTransaction(token, spender) {
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
export function buildV4InitializePoolTransaction(params) {
    const tickSpacing = FEE_TO_TICK_SPACING[params.fee];
    if (!tickSpacing) {
        throw new Error(`Invalid V4 fee tier: ${params.fee}`);
    }
    // PoolKey struct
    const poolKey = params.token0.slice(2).padStart(64, '0') +
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
export function buildV4MintPositionTransaction(params) {
    const tickSpacing = FEE_TO_TICK_SPACING[params.fee];
    const { minTick, maxTick } = getTickRange(tickSpacing);
    const slippage = params.slippageTolerance || 0.5;
    const slippageMultiplier = 1 - (slippage / 100);
    const amount0Min = BigInt(Math.floor(Number(params.amount0) * slippageMultiplier)).toString(16).padStart(64, '0');
    const amount1Min = BigInt(Math.floor(Number(params.amount1) * slippageMultiplier)).toString(16).padStart(64, '0');
    // PoolKey
    const poolKey = params.token0.slice(2).padStart(64, '0') +
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
export function buildV3InitializePoolTransaction(params) {
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
export function buildV3MintPositionTransaction(params) {
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
export function buildV2CreatePoolTransaction(params) {
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
