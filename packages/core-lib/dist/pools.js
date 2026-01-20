/**
 * Pool Fetching Logic for Railway Server
 * Ported from worker/src/index.ts
 */
import { ARBME, GECKO_API, GECKO_TIMEOUT, DEFAULT_TIMEOUT, RPC_TIMEOUT, BASE_RPCS_FALLBACK, TOKENS, PAGE_ARBME_POOL, V4_ARBME_POOLS, GET_RESERVES, } from './constants.js';
// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
/**
 * Retry helper with exponential backoff for external APIs
 */
async function fetchWithRetry(url, options = {}, maxRetries = 2, timeoutMs = GECKO_TIMEOUT) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, options, timeoutMs);
            // Retry on 429 (rate limit) or 5xx errors
            if (response.status === 429 || response.status >= 500) {
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 3000); // 1s, 2s, 3s max
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            return response;
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Don't retry on abort (timeout)
            if (lastError.name === 'AbortError') {
                throw lastError;
            }
            // Retry on network errors with backoff
            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
        }
    }
    throw lastError || new Error('Max retries exceeded');
}
/**
 * Get Trust Wallet asset logo URL for a token
 */
function getTokenLogo(address) {
    if (!address || address === '0x0000000000000000000000000000000000000000') {
        return '';
    }
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/${address}/logo.png`;
}
/**
 * Extract token address from GeckoTerminal token ID (format: "base_0x...")
 */
function extractTokenAddress(geckoTokenId) {
    const parts = geckoTokenId.split('_');
    return parts.length > 1 ? parts[1] : geckoTokenId;
}
/**
 * Build RPC list with Alchemy first if available
 */
function getBaseRpcs(alchemyKey) {
    const rpcs = [];
    if (alchemyKey) {
        rpcs.push(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`);
    }
    rpcs.push(...BASE_RPCS_FALLBACK);
    return rpcs;
}
/**
 * Call contract with RPC fallback
 */
async function rpcCall(to, data, alchemyKey) {
    const rpcs = getBaseRpcs(alchemyKey);
    for (const rpc of rpcs) {
        try {
            const response = await fetchWithTimeout(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_call',
                    params: [{ to, data }, 'latest'],
                }),
            }, RPC_TIMEOUT);
            if (!response.ok)
                continue;
            const json = await response.json();
            if (json.result && json.result !== '0x') {
                return json.result;
            }
        }
        catch (error) {
            continue;
        }
    }
    return null;
}
// ═══════════════════════════════════════════════════════════════════════════════
// GECKOTERMINAL API
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Fetch pools for a token from GeckoTerminal
 */
async function fetchGeckoTerminalPools(tokenAddress) {
    try {
        const response = await fetchWithRetry(`${GECKO_API}/networks/base/tokens/${tokenAddress.toLowerCase()}/pools?page=1`, { headers: { Accept: 'application/json' } }, 2, GECKO_TIMEOUT);
        if (!response.ok) {
            console.error(`[Pools] GeckoTerminal error: ${response.status}`);
            return [];
        }
        const data = await response.json();
        if (!data.data?.length)
            return [];
        const pools = [];
        for (const pool of data.data) {
            const attrs = pool.attributes;
            const tvl = parseFloat(attrs.reserve_in_usd) || 0;
            const volume24h = parseFloat(attrs.volume_usd?.h24) || 0;
            const priceChange24h = parseFloat(attrs.price_change_percentage?.h24) || 0;
            // Determine ARBME price
            const baseTokenId = pool.relationships.base_token.data.id;
            const isArbmeBase = baseTokenId.toLowerCase().includes(tokenAddress.toLowerCase());
            const arbmePrice = isArbmeBase
                ? attrs.base_token_price_usd
                : attrs.quote_token_price_usd;
            // Clean pool name
            const poolName = attrs.name.replace(/\s+\d+(\.\d+)?%$/, '').trim();
            // Get DEX name
            const dexId = pool.relationships.dex.data.id.toLowerCase();
            let dexName = 'DEX';
            if (dexId.includes('uniswap-v4') || dexId.includes('uniswap_v4'))
                dexName = 'Uniswap V4';
            else if (dexId.includes('uniswap-v3') || dexId.includes('uniswap_v3'))
                dexName = 'Uniswap V3';
            else if (dexId.includes('uniswap-v2') || dexId.includes('uniswap_v2'))
                dexName = 'Uniswap V2';
            else if (dexId.includes('aerodrome'))
                dexName = 'Aerodrome';
            // Extract token addresses
            const token0Addr = extractTokenAddress(pool.relationships.base_token.data.id);
            const token1Addr = extractTokenAddress(pool.relationships.quote_token.data.id);
            pools.push({
                pair: poolName,
                pairAddress: attrs.address,
                dex: dexName,
                tvl,
                volume24h,
                priceUsd: arbmePrice,
                priceChange24h,
                url: `https://dexscreener.com/base/${attrs.address}`,
                source: 'geckoterminal',
                token0: token0Addr,
                token1: token1Addr,
                token0Logo: getTokenLogo(token0Addr),
                token1Logo: getTokenLogo(token1Addr),
            });
        }
        console.log(`[Pools] Found ${pools.length} pools on GeckoTerminal`);
        return pools;
    }
    catch (error) {
        console.error('[Pools] GeckoTerminal fetch error:', error);
        return [];
    }
}
/**
 * Fetch token price from GeckoTerminal (uses highest TVL pool)
 */
async function fetchTokenPrice(tokenAddress) {
    try {
        const response = await fetchWithRetry(`${GECKO_API}/networks/base/tokens/${tokenAddress.toLowerCase()}/pools?page=1`, { headers: { Accept: 'application/json' } }, 2, GECKO_TIMEOUT);
        if (!response.ok)
            return 0;
        const data = await response.json();
        if (!data.data?.length)
            return 0;
        // Find highest TVL pool with a stable pair
        let bestPrice = 0;
        let bestTvl = 0;
        for (const pool of data.data) {
            const tvl = parseFloat(pool.attributes.reserve_in_usd) || 0;
            const name = pool.attributes.name.toLowerCase();
            // Prefer pools paired with stable/major tokens
            const isGoodPair = name.includes('weth') || name.includes('usdc') ||
                name.includes('clanker') || name.includes('eth');
            if (tvl > bestTvl && isGoodPair) {
                const baseTokenId = pool.relationships.base_token.data.id;
                const isTokenBase = baseTokenId.toLowerCase().includes(tokenAddress.toLowerCase());
                const price = parseFloat(isTokenBase
                    ? pool.attributes.base_token_price_usd
                    : pool.attributes.quote_token_price_usd);
                if (price > 0) {
                    bestPrice = price;
                    bestTvl = tvl;
                }
            }
        }
        return bestPrice;
    }
    catch (error) {
        console.error(`[Pools] Error fetching price for ${tokenAddress}:`, error);
        return 0;
    }
}
/**
 * Fetch all required token prices
 */
async function fetchTokenPrices() {
    const tokens = {
        PAGE: TOKENS.PAGE.toLowerCase(),
        OINC: TOKENS.OINC.toLowerCase(),
        CLANKER: TOKENS.CLANKER.toLowerCase(),
        USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        cbBTC: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
    };
    const [pagePrice, oincPrice, clankerPrice, usdcPrice, cbbtcPrice] = await Promise.all([
        fetchTokenPrice(tokens.PAGE),
        fetchTokenPrice(tokens.OINC),
        fetchTokenPrice(tokens.CLANKER),
        fetchTokenPrice(tokens.USDC),
        fetchTokenPrice(tokens.cbBTC),
    ]);
    console.log(`[Pools] Prices - PAGE: $${pagePrice}, OINC: $${oincPrice}, CLANKER: $${clankerPrice}, USDC: $${usdcPrice}, cbBTC: $${cbbtcPrice}`);
    return {
        [tokens.PAGE]: pagePrice,
        [tokens.OINC]: oincPrice,
        [tokens.CLANKER]: clankerPrice,
        [tokens.USDC]: usdcPrice,
        [tokens.cbBTC]: cbbtcPrice,
    };
}
// ═══════════════════════════════════════════════════════════════════════════════
// RPC POOL FETCHING (V2/V4)
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Fetch PAGE/ARBME V2 pool from RPC
 */
async function fetchPageArbmePool(pagePrice, alchemyKey) {
    try {
        const result = await rpcCall(PAGE_ARBME_POOL.address, GET_RESERVES, alchemyKey);
        if (!result)
            return null;
        // Decode reserves (reserve0, reserve1, blockTimestampLast)
        const reserve0 = BigInt('0x' + result.slice(2, 66));
        const reserve1 = BigInt('0x' + result.slice(66, 130));
        const pageReserve = Number(reserve0) / 1e18;
        const arbmeReserve = Number(reserve1) / 1e18;
        if (pageReserve === 0 || arbmeReserve === 0)
            return null;
        const arbmePrice = (pageReserve * pagePrice) / arbmeReserve;
        const tvl = pageReserve * pagePrice * 2;
        return {
            pair: 'PAGE/ARBME',
            pairAddress: PAGE_ARBME_POOL.address,
            dex: 'Uniswap V2',
            tvl,
            volume24h: 0,
            priceUsd: arbmePrice.toString(),
            priceChange24h: 0,
            url: `https://dexscreener.com/base/${PAGE_ARBME_POOL.address}`,
            source: 'rpc',
            token0: PAGE_ARBME_POOL.token0,
            token1: PAGE_ARBME_POOL.token1,
            token0Logo: getTokenLogo(PAGE_ARBME_POOL.token0),
            token1Logo: getTokenLogo(PAGE_ARBME_POOL.token1),
        };
    }
    catch (error) {
        console.error('[Pools] Error fetching PAGE/ARBME pool:', error);
        return null;
    }
}
/**
 * Fetch OINC/ARBME V4 pool from RPC
 */
async function fetchOincArbmePool(oincPrice, alchemyKey) {
    try {
        // V4 pools need getSlot0 from StateView contract
        const STATE_VIEW = '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6';
        // Encode getSlot0(PoolKey) call
        // For simplicity, using the known OINC/ARBME pool ID
        // This is a simplified version - full implementation would construct PoolKey
        return null; // TODO: Implement V4 pool fetching if needed
    }
    catch (error) {
        console.error('[Pools] Error fetching OINC/ARBME pool:', error);
        return null;
    }
}
/**
 * Fetch CLANKER/ARBME V2 pool from RPC
 */
async function fetchClankerArbmeV2Pool(clankerPrice, alchemyKey) {
    try {
        const CLANKER_V2_ADDR = '0x14aeb8cfdf477001a60f5196ec2ddfe94771b794';
        const result = await rpcCall(CLANKER_V2_ADDR, GET_RESERVES, alchemyKey);
        if (!result)
            return null;
        const reserve0 = BigInt('0x' + result.slice(2, 66));
        const reserve1 = BigInt('0x' + result.slice(66, 130));
        const clankerReserve = Number(reserve0) / 1e18;
        const arbmeReserve = Number(reserve1) / 1e18;
        if (clankerReserve === 0 || arbmeReserve === 0)
            return null;
        const arbmePrice = (clankerReserve * clankerPrice) / arbmeReserve;
        const tvl = clankerReserve * clankerPrice * 2;
        return {
            pair: 'CLANKER/ARBME',
            pairAddress: CLANKER_V2_ADDR,
            dex: 'Uniswap V2',
            tvl,
            volume24h: 0,
            priceUsd: arbmePrice.toString(),
            priceChange24h: 0,
            url: `https://dexscreener.com/base/${CLANKER_V2_ADDR}`,
            source: 'rpc',
            token0: TOKENS.CLANKER,
            token1: ARBME.address,
            token0Logo: getTokenLogo(TOKENS.CLANKER),
            token1Logo: getTokenLogo(ARBME.address),
        };
    }
    catch (error) {
        console.error('[Pools] Error fetching CLANKER/ARBME V2 pool:', error);
        return null;
    }
}
/**
 * Fetch V4 ARBME pools from RPC
 */
async function fetchV4ArbmePools(tokenPrices, alchemyKey) {
    // V4 pool fetching is complex and requires StateView contract calls
    // For now, rely on GeckoTerminal which indexes most V4 pools
    // TODO: Implement if needed
    return [];
}
const cache = new Map();
const CACHE_TTL = 60000; // 60 seconds
/**
 * Fetch all ARBME pools
 */
export async function fetchPools(alchemyKey) {
    const cacheKey = 'pools';
    const cached = cache.get(cacheKey);
    // Return cache if fresh
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('[Pools] Cache HIT');
        return cached.data;
    }
    console.log('[Pools] Cache MISS, fetching fresh data...');
    try {
        // Fetch GeckoTerminal pools and token prices in parallel
        const [arbmePools, tokenPrices] = await Promise.all([
            fetchGeckoTerminalPools(ARBME.address),
            fetchTokenPrices(),
        ]);
        const pagePrice = tokenPrices[TOKENS.PAGE.toLowerCase()] || 0;
        const oincPrice = tokenPrices[TOKENS.OINC.toLowerCase()] || 0;
        const clankerPrice = tokenPrices[TOKENS.CLANKER.toLowerCase()] || 0;
        // Fetch additional pools not indexed by GeckoTerminal
        const [pageArbmePool, oincArbmePool, clankerArbmeV2Pool, v4Pools] = await Promise.all([
            fetchPageArbmePool(pagePrice, alchemyKey),
            fetchOincArbmePool(oincPrice, alchemyKey),
            fetchClankerArbmeV2Pool(clankerPrice, alchemyKey),
            fetchV4ArbmePools(tokenPrices, alchemyKey),
        ]);
        // Combine all pools, avoiding duplicates
        const allPools = [...arbmePools];
        // Only add PAGE/ARBME V2 if not already in GeckoTerminal results
        const hasPageV2Pool = arbmePools.some(p => p.pairAddress.toLowerCase() === PAGE_ARBME_POOL.address.toLowerCase());
        if (pageArbmePool && !hasPageV2Pool) {
            allPools.push(pageArbmePool);
        }
        // Only add OINC/ARBME if not already in results
        const hasOincPool = arbmePools.some(p => p.pair.toUpperCase().includes('OINC'));
        if (oincArbmePool && !hasOincPool) {
            allPools.push(oincArbmePool);
        }
        // Only add CLANKER/ARBME V2 if not already in results
        const CLANKER_V2_ADDR = '0x14aeb8cfdf477001a60f5196ec2ddfe94771b794';
        const hasClankerV2Pool = arbmePools.some(p => p.pairAddress.toLowerCase() === CLANKER_V2_ADDR.toLowerCase());
        if (clankerArbmeV2Pool && !hasClankerV2Pool) {
            allPools.push(clankerArbmeV2Pool);
        }
        // Add V4 pools (avoid duplicates by poolId)
        for (const v4Pool of v4Pools) {
            const alreadyExists = allPools.some(p => p.pairAddress.toLowerCase() === v4Pool.pairAddress.toLowerCase());
            if (!alreadyExists) {
                allPools.push(v4Pool);
            }
        }
        // Enrich GeckoTerminal V4 pools with fee data from config
        for (const pool of allPools) {
            if (pool.dex.includes('V4') && !pool.fee && pool.token0 && pool.token1) {
                const t0 = pool.token0.toLowerCase();
                const t1 = pool.token1.toLowerCase();
                const matchingConfig = V4_ARBME_POOLS.find(cfg => {
                    const cfg0 = cfg.token0.toLowerCase();
                    const cfg1 = cfg.token1.toLowerCase();
                    return (t0 === cfg0 && t1 === cfg1) || (t0 === cfg1 && t1 === cfg0);
                });
                if (matchingConfig) {
                    pool.fee = matchingConfig.fee;
                }
            }
        }
        // Sort by TVL
        allPools.sort((a, b) => b.tvl - a.tvl);
        const totalTvl = allPools.reduce((sum, p) => sum + p.tvl, 0);
        const arbmePrice = allPools.find(p => p.tvl > 0)?.priceUsd || '0';
        const responseData = {
            token: ARBME.address,
            poolCount: allPools.length,
            totalTvl,
            arbmePrice,
            tokenPrices: {
                PAGE: pagePrice,
                OINC: oincPrice,
                CLANKER: clankerPrice,
            },
            pools: allPools,
            lastUpdated: new Date().toISOString(),
        };
        // Cache the result
        cache.set(cacheKey, {
            data: responseData,
            timestamp: Date.now(),
        });
        console.log(`[Pools] Cached ${allPools.length} pools, TVL $${totalTvl.toFixed(2)}`);
        return responseData;
    }
    catch (error) {
        console.error('[Pools] Error fetching pools:', error);
        // Return stale cache if available
        if (cached) {
            console.log('[Pools] Returning stale cache due to error');
            return cached.data;
        }
        throw error;
    }
}
