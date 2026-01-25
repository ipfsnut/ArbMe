/**
 * On-chain pricing service
 * Calculates token prices from pool reserves/sqrtPriceX96 instead of external APIs
 */
import { createPublicClient, http, keccak256 } from 'viem';
import { base } from 'viem/chains';
// Registry of pools we can use for pricing (lowercase addresses)
// We'll discover WETH pairs dynamically from GeckoTerminal and cache them
const PRICING_POOLS = [
    // Known cross pairs (can be used for multi-hop pricing)
    {
        address: '0x14aeb8cfdf477001a60f5196ec2ddfe94771b794',
        type: 'V2',
        token0: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb', // CLANKER
        token1: '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07', // ARBME
    },
    {
        address: '0x11FD494780ba58550E027ef64C0e36a914FF0F8A',
        type: 'V2',
        token0: '0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE', // PAGE
        token1: '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07', // ARBME
    },
];
// Cache for discovered WETH pairs
const wethPairCache = new Map();
// ABIs
const V2_PAIR_ABI = [
    {
        name: 'getReserves',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [
            { name: 'reserve0', type: 'uint112' },
            { name: 'reserve1', type: 'uint112' },
            { name: 'blockTimestampLast', type: 'uint32' },
        ],
    },
    {
        name: 'token0',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }],
    },
    {
        name: 'token1',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }],
    },
];
const V3_POOL_ABI = [
    {
        name: 'slot0',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [
            { name: 'sqrtPriceX96', type: 'uint160' },
            { name: 'tick', type: 'int24' },
            { name: 'observationIndex', type: 'uint16' },
            { name: 'observationCardinality', type: 'uint16' },
            { name: 'observationCardinalityNext', type: 'uint16' },
            { name: 'feeProtocol', type: 'uint8' },
            { name: 'unlocked', type: 'bool' },
        ],
    },
];
const V4_STATE_VIEW_ABI = [
    {
        name: 'getSlot0',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'poolId', type: 'bytes32' },
        ],
        outputs: [
            { name: 'sqrtPriceX96', type: 'uint160' },
            { name: 'tick', type: 'int24' },
            { name: 'protocolFee', type: 'uint24' },
            { name: 'lpFee', type: 'uint24' },
        ],
    },
];
const V4_STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71'; // Uniswap V4 StateView on Base
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
// Helper to calculate V4 pool ID from pool key
function calculateV4PoolId(currency0, currency1, fee, tickSpacing, hooks) {
    const poolKeyEncoded = currency0.slice(2).toLowerCase().padStart(64, '0') +
        currency1.slice(2).toLowerCase().padStart(64, '0') +
        fee.toString(16).padStart(64, '0') +
        tickSpacing.toString(16).padStart(64, '0') +
        hooks.slice(2).toLowerCase().padStart(64, '0');
    return keccak256(`0x${poolKeyEncoded}`);
}
/**
 * Get WETH USD price from GeckoTerminal (used as anchor)
 */
async function getWethUsdPrice() {
    try {
        const url = `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${WETH_ADDRESS}`;
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`[Pricing] Failed to fetch WETH price: ${response.status}`);
            return 0;
        }
        const data = await response.json();
        const price = data?.data?.attributes?.token_prices?.[WETH_ADDRESS.toLowerCase()];
        if (price) {
            const wethPrice = parseFloat(price);
            console.log(`[Pricing] WETH anchor price: $${wethPrice}`);
            return wethPrice;
        }
        return 0;
    }
    catch (error) {
        console.error('[Pricing] Failed to fetch WETH price:', error);
        return 0;
    }
}
/**
 * Calculate token1/token0 price from V2 reserves
 */
function calculateV2Price(reserve0, reserve1, decimals0, decimals1) {
    // price = reserve1 / reserve0 (adjusted for decimals)
    const reserve0Adjusted = Number(reserve0) / Math.pow(10, decimals0);
    const reserve1Adjusted = Number(reserve1) / Math.pow(10, decimals1);
    if (reserve0Adjusted === 0)
        return 0;
    return reserve1Adjusted / reserve0Adjusted;
}
/**
 * Calculate token1/token0 price from sqrtPriceX96
 */
function calculatePriceFromSqrtPriceX96(sqrtPriceX96, decimals0, decimals1) {
    // price = (sqrtPriceX96 / 2^96)^2 * (10^decimals0 / 10^decimals1)
    const Q96 = 2 ** 96;
    const sqrtPrice = Number(sqrtPriceX96) / Q96;
    const price = sqrtPrice ** 2;
    // Adjust for decimals
    const decimalAdjustment = Math.pow(10, decimals0 - decimals1);
    return price * decimalAdjustment;
}
/**
 * Fetch pool price for a specific pool
 */
async function fetchPoolPrice(pool, decimals0, decimals1, alchemyKey) {
    const rpcUrl = alchemyKey
        ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : 'https://mainnet.base.org';
    const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
    });
    try {
        if (pool.type === 'V2') {
            const [reserve0, reserve1] = await client.readContract({
                address: pool.address,
                abi: V2_PAIR_ABI,
                functionName: 'getReserves',
            });
            return calculateV2Price(reserve0, reserve1, decimals0, decimals1);
        }
        else if (pool.type === 'V3') {
            const slot0 = await client.readContract({
                address: pool.address,
                abi: V3_POOL_ABI,
                functionName: 'slot0',
            });
            const sqrtPriceX96 = slot0[0];
            return calculatePriceFromSqrtPriceX96(sqrtPriceX96, decimals0, decimals1);
        }
        else if (pool.type === 'V4') {
            if (!pool.fee || !pool.tickSpacing || !pool.hooks) {
                console.warn(`[Pricing] V4 pool ${pool.address} missing fee/tickSpacing/hooks`);
                return 0;
            }
            const poolId = calculateV4PoolId(pool.token0, pool.token1, pool.fee, pool.tickSpacing, pool.hooks);
            const slot0 = await client.readContract({
                address: V4_STATE_VIEW,
                abi: V4_STATE_VIEW_ABI,
                functionName: 'getSlot0',
                args: [poolId],
            });
            const sqrtPriceX96 = slot0[0];
            return calculatePriceFromSqrtPriceX96(sqrtPriceX96, decimals0, decimals1);
        }
        return 0;
    }
    catch (error) {
        console.error(`[Pricing] Failed to fetch pool price for ${pool.address}:`, error);
        return 0;
    }
}
/**
 * Discover and cache WETH pair for a token from GeckoTerminal
 */
async function discoverWethPair(tokenAddress) {
    const normalizedToken = tokenAddress.toLowerCase();
    // Check cache first
    if (wethPairCache.has(normalizedToken)) {
        return wethPairCache.get(normalizedToken);
    }
    try {
        const url = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${tokenAddress}/pools`;
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`[Pricing] GeckoTerminal returned ${response.status} for ${tokenAddress}`);
            return null;
        }
        const data = await response.json();
        const pools = data?.data || [];
        // Find highest TVL pool paired with WETH, preferring V2/V3 over V4
        // (V4 pools require fee/tickSpacing/hooks which GeckoTerminal doesn't provide)
        // Prefer pools with higher TVL to avoid low-liquidity pools with bad pricing
        let bestPool = null;
        let bestTvl = 0;
        const MIN_TVL = 100; // Only consider pools with at least $100 TVL (lowered for small tokens)
        for (const pool of pools) {
            const attrs = pool.attributes;
            const tvl = parseFloat(attrs.reserve_in_usd) || 0;
            const poolName = attrs.name.toLowerCase();
            const dexId = pool.relationships.dex.data.id.toLowerCase();
            // Look for WETH pairs with sufficient liquidity
            if (poolName.includes('weth') && tvl >= MIN_TVL) {
                const isV4 = dexId.includes('v4');
                const isV3 = dexId.includes('v3');
                const isV2 = !isV4 && !isV3;
                // Prefer V2/V3 over V4 (V4 requires extra params we don't have)
                // Among V2/V3 pools, prefer highest TVL
                if (isV2 || isV3) {
                    if (tvl > bestTvl || (bestPool && bestPool.isV4)) {
                        bestPool = pool;
                        bestPool.isV4 = false;
                        bestTvl = tvl;
                        console.log(`[Pricing] Found ${isV2 ? 'V2' : 'V3'} WETH pair for ${tokenAddress} with TVL $${tvl.toFixed(0)}`);
                    }
                }
                else if (isV4 && !bestPool) {
                    // Only use V4 if no V2/V3 pool found
                    bestPool = pool;
                    bestPool.isV4 = true;
                    bestTvl = tvl;
                }
            }
        }
        if (!bestPool) {
            console.warn(`[Pricing] No WETH pair found for ${tokenAddress}`);
            return null;
        }
        // Determine pool type from DEX name
        const dexId = bestPool.relationships.dex.data.id.toLowerCase();
        let poolType = 'V2';
        if (dexId.includes('v4'))
            poolType = 'V4';
        else if (dexId.includes('v3'))
            poolType = 'V3';
        // Skip V4 pools since we don't have the required parameters
        if (poolType === 'V4') {
            console.warn(`[Pricing] Skipping V4 pool for ${tokenAddress} (missing fee/tickSpacing/hooks)`);
            return null;
        }
        // Extract token addresses from GeckoTerminal IDs
        const baseTokenId = bestPool.relationships.base_token.data.id;
        const quoteTokenId = bestPool.relationships.quote_token.data.id;
        const token0 = baseTokenId.split('_')[1] || baseTokenId;
        const token1 = quoteTokenId.split('_')[1] || quoteTokenId;
        const pricingPool = {
            address: bestPool.attributes.address,
            type: poolType,
            token0,
            token1,
        };
        // Cache it
        wethPairCache.set(normalizedToken, pricingPool);
        console.log(`[Pricing] Discovered ${poolType} WETH pair for ${tokenAddress}: ${pricingPool.address}`);
        return pricingPool;
    }
    catch (error) {
        console.error(`[Pricing] Failed to discover WETH pair for ${tokenAddress}:`, error);
        return null;
    }
}
/**
 * Find a pricing pool for a token (preferably paired with WETH)
 */
async function findPricingPool(tokenAddress) {
    const normalizedToken = tokenAddress.toLowerCase();
    // First, check static registry for WETH pair
    const staticWethPair = PRICING_POOLS.find((pool) => (pool.token0.toLowerCase() === normalizedToken && pool.token1.toLowerCase() === WETH_ADDRESS.toLowerCase()) ||
        (pool.token1.toLowerCase() === normalizedToken && pool.token0.toLowerCase() === WETH_ADDRESS.toLowerCase()));
    if (staticWethPair) {
        return staticWethPair;
    }
    // Try to discover WETH pair dynamically
    const discoveredPair = await discoverWethPair(tokenAddress);
    if (discoveredPair) {
        return discoveredPair;
    }
    // If no WETH pair found, try to find any pair with this token for multi-hop
    return PRICING_POOLS.find((pool) => pool.token0.toLowerCase() === normalizedToken || pool.token1.toLowerCase() === normalizedToken) || null;
}
/**
 * Get token price in USD using on-chain pool data
 */
export async function getTokenPriceOnChain(tokenAddress, decimals, wethPrice, alchemyKey) {
    const normalizedToken = tokenAddress.toLowerCase();
    // WETH is the anchor
    if (normalizedToken === WETH_ADDRESS.toLowerCase()) {
        return wethPrice;
    }
    // Find a pricing pool for this token
    const pool = await findPricingPool(tokenAddress);
    if (!pool) {
        console.warn(`[Pricing] No pricing pool found for ${tokenAddress}`);
        return 0;
    }
    const isToken0 = pool.token0.toLowerCase() === normalizedToken;
    const pairedToken = isToken0 ? pool.token1 : pool.token0;
    const pairedTokenDecimals = 18; // Assume 18 for now, we'd need to fetch this properly
    // Fetch pool price
    const poolPrice = await fetchPoolPrice(pool, isToken0 ? decimals : pairedTokenDecimals, isToken0 ? pairedTokenDecimals : decimals, alchemyKey);
    if (poolPrice === 0) {
        return 0;
    }
    // If paired with WETH directly, we're done
    if (pairedToken.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
        // poolPrice is token/WETH, multiply by WETH USD price
        return isToken0 ? poolPrice * wethPrice : (1 / poolPrice) * wethPrice;
    }
    // Otherwise, need multi-hop pricing (token → pairedToken → WETH)
    console.log(`[Pricing] Attempting multi-hop pricing for ${tokenAddress} via ${pairedToken}`);
    // Get pairedToken price in WETH
    const pairedTokenPrice = await getTokenPriceOnChain(pairedToken, pairedTokenDecimals, wethPrice, alchemyKey);
    if (pairedTokenPrice === 0) {
        console.warn(`[Pricing] Failed to get price for intermediate token ${pairedToken}`);
        return 0;
    }
    // Calculate our token price: (our token / paired token) * (paired token USD price)
    return isToken0 ? poolPrice * pairedTokenPrice : (1 / poolPrice) * pairedTokenPrice;
}
/**
 * Get prices for multiple tokens in batch using on-chain data
 */
export async function getTokenPricesOnChain(tokens, alchemyKey) {
    const prices = new Map();
    console.log(`[Pricing] Fetching on-chain prices for ${tokens.length} tokens...`);
    // Get WETH price as anchor
    const wethPrice = await getWethUsdPrice();
    if (wethPrice === 0) {
        console.error('[Pricing] Failed to get WETH anchor price, cannot calculate token prices');
        return prices;
    }
    // Calculate each token price
    for (const token of tokens) {
        try {
            const price = await getTokenPriceOnChain(token.address, token.decimals, wethPrice, alchemyKey);
            if (price > 0) {
                prices.set(token.address.toLowerCase(), price);
                console.log(`[Pricing] ${token.address}: $${price}`);
            }
        }
        catch (error) {
            console.error(`[Pricing] Failed to get price for ${token.address}:`, error);
        }
    }
    // Only filter out truly invalid prices (0, negative, infinity, NaN)
    // Show all real on-chain prices no matter how small or large
    const filteredPrices = new Map();
    let filteredCount = 0;
    for (const [address, price] of prices) {
        if (price > 0 && isFinite(price)) {
            filteredPrices.set(address, price);
        }
        else {
            console.warn(`[Pricing] ⚠️  Filtering out invalid price for ${address}: $${price}`);
            filteredCount++;
        }
    }
    console.log(`[Pricing] Successfully priced ${filteredPrices.size}/${tokens.length} tokens`);
    return filteredPrices;
}
