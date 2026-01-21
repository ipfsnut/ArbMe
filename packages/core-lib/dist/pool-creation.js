/**
 * Pool Creation Module
 * Handles Uniswap V2/V3/V4 pool creation and liquidity provision
 */
import { FEE_TO_TICK_SPACING, BASE_RPCS_FALLBACK, RPC_TIMEOUT } from './constants.js';
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
export const V4_STATE_VIEW = '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6';
// Aerodrome Slipstream (Concentrated Liquidity)
export const AERO_SLIPSTREAM_FACTORY = '0xeC8E5342B19977B4eF8892e02D8DAEcfa1315831';
export const AERO_SLIPSTREAM_ROUTER = '0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5';
export const AERO_SLIPSTREAM_POSITION_MANAGER = '0x827922686190790b37229fd06084350E74485b72';
// Map Uniswap fee tiers to Aerodrome tick spacing
export const UNISWAP_FEE_TO_AERO_TICK_SPACING = {
    100: 1, // 0.01% → CL1 (stablecoins)
    500: 50, // 0.05% → CL50 (correlated)
    3000: 100, // 0.30% → CL100 (standard volatile)
    10000: 200, // 1.00% → CL200 (exotic)
    30000: 200, // 3.00% → CL200
    50000: 200, // 5.00% → CL200
    100000: 2000, // 10.00% → CL2000
    150000: 2000, // 15.00% → CL2000
    200000: 2000, // 20.00% → CL2000
    250000: 2000, // 25.00% → CL2000
    500000: 2000, // 50.00% → CL2000
};
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
    // But we can do: sqrt(price * 2^64) * 2^64 to keep precision
    const Q96 = 2n ** 96n;
    const Q64 = 2n ** 64n;
    // Scale price by 2^64 before sqrt to maintain precision
    const scaledPrice = price * Number(Q64);
    const sqrtScaledPrice = Math.sqrt(scaledPrice);
    // Convert to BigInt and multiply by remaining 2^32
    const sqrtScaledPriceBigInt = BigInt(Math.floor(sqrtScaledPrice));
    const Q32 = 2n ** 32n;
    return sqrtScaledPriceBigInt * Q32;
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
let rpcUrl = BASE_RPCS_FALLBACK[0];
let rpcIndex = 0;
async function rpcCall(method, params) {
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
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message);
        }
        return data.result;
    }
    catch (err) {
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
    // Encode PoolKey struct
    const poolKey = token0.slice(2).padStart(64, '0') +
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
// ═══════════════════════════════════════════════════════════════════════════════
// Aerodrome Slipstream Pool Creation
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Check if Aerodrome Slipstream pool exists
 */
export async function checkAeroPoolExists(token0, token1, tickSpacing) {
    try {
        // getPool(address,address,int24) selector: 0x1698ee82
        const data = '0x1698ee82' +
            token0.slice(2).padStart(64, '0') +
            token1.slice(2).padStart(64, '0') +
            BigInt(tickSpacing).toString(16).padStart(64, '0');
        const result = await rpcCall('eth_call', [
            { to: AERO_SLIPSTREAM_FACTORY, data },
            'latest'
        ]);
        const poolAddress = ('0x' + result.slice(-40));
        const exists = poolAddress !== '0x0000000000000000000000000000000000000000';
        return { exists, pool: exists ? poolAddress : undefined };
    }
    catch (err) {
        console.error('[checkAeroPoolExists] Error:', err);
        return { exists: false };
    }
}
/**
 * Build Aerodrome Slipstream pool initialization transaction
 * Note: Aerodrome may auto-create pools, so this may not be needed
 */
export function buildAeroInitializePoolTransaction(params) {
    const tickSpacing = UNISWAP_FEE_TO_AERO_TICK_SPACING[params.fee] || 100;
    // createPool(address,address,int24,uint160) selector: 0x13af4035
    const data = '0x13af4035' +
        params.token0.slice(2).padStart(64, '0') +
        params.token1.slice(2).padStart(64, '0') +
        BigInt(tickSpacing).toString(16).padStart(64, '0') +
        params.sqrtPriceX96.toString(16).padStart(64, '0');
    return {
        to: AERO_SLIPSTREAM_FACTORY,
        data,
        value: '0',
    };
}
/**
 * Build Aerodrome Slipstream mint position transaction
 */
export function buildAeroMintPositionTransaction(params) {
    const tickSpacing = UNISWAP_FEE_TO_AERO_TICK_SPACING[params.fee] || 100;
    // Full range ticks based on tick spacing
    const tickLower = Math.ceil(-887272 / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor(887272 / tickSpacing) * tickSpacing;
    // Calculate min amounts with slippage
    const slippageMultiplier = 1 - (params.slippageTolerance || 0.5) / 100;
    const amount0Min = BigInt(Math.floor(Number(params.amount0) * slippageMultiplier));
    const amount1Min = BigInt(Math.floor(Number(params.amount1) * slippageMultiplier));
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    // mint(MintParams) - similar to Uniswap V3
    // struct MintParams {
    //   address token0;
    //   address token1;
    //   int24 tickSpacing;
    //   int24 tickLower;
    //   int24 tickUpper;
    //   uint256 amount0Desired;
    //   uint256 amount1Desired;
    //   uint256 amount0Min;
    //   uint256 amount1Min;
    //   address recipient;
    //   uint256 deadline;
    //   uint160 sqrtPriceX96;
    // }
    // selector: 0x11ed56c9
    const data = '0x11ed56c9' +
        '0000000000000000000000000000000000000000000000000000000000000020' + // offset
        params.token0.slice(2).padStart(64, '0') +
        params.token1.slice(2).padStart(64, '0') +
        BigInt(tickSpacing).toString(16).padStart(64, '0') +
        (tickLower < 0 ? 'f'.repeat(64 - tickLower.toString(16).length) + tickLower.toString(16).slice(1) : BigInt(tickLower).toString(16).padStart(64, '0')) +
        (tickUpper < 0 ? 'f'.repeat(64 - tickUpper.toString(16).length) + tickUpper.toString(16).slice(1) : BigInt(tickUpper).toString(16).padStart(64, '0')) +
        BigInt(params.amount0).toString(16).padStart(64, '0') +
        BigInt(params.amount1).toString(16).padStart(64, '0') +
        amount0Min.toString(16).padStart(64, '0') +
        amount1Min.toString(16).padStart(64, '0') +
        params.recipient.slice(2).padStart(64, '0') +
        deadline.toString(16).padStart(64, '0') +
        params.sqrtPriceX96.toString(16).padStart(64, '0');
    return {
        to: AERO_SLIPSTREAM_POSITION_MANAGER,
        data,
        value: '0',
    };
}
