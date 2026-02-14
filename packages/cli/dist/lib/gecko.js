/**
 * GeckoTerminal client — fetches pool data for any Base token
 */
const GECKO_API = 'https://api.geckoterminal.com/api/v2';
const GECKO_TIMEOUT = 6000;
// ═══════════════════════════════════════════════════════════════════════════════
// Fetch helpers (ported from core-lib/pools.ts)
// ═══════════════════════════════════════════════════════════════════════════════
async function fetchWithTimeout(url, options = {}, timeoutMs = GECKO_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    }
    finally {
        clearTimeout(timeoutId);
    }
}
async function fetchWithRetry(url, options = {}, maxRetries = 2, timeoutMs = GECKO_TIMEOUT) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, options, timeoutMs);
            if (response.status === 429 || response.status >= 500) {
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
            }
            return response;
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (lastError.name === 'AbortError') {
                throw lastError;
            }
            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }
        }
    }
    throw lastError || new Error('Max retries exceeded');
}
// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Fetch all pools for a token from GeckoTerminal.
 * Fetches up to 3 pages (60 pools) to get comprehensive coverage.
 */
export async function fetchPoolsForToken(address, minTvl = 0, verbose = false) {
    const allPools = [];
    for (let page = 1; page <= 3; page++) {
        const url = `${GECKO_API}/networks/base/tokens/${address}/pools?page=${page}`;
        if (verbose)
            console.error(`  Fetching page ${page}: ${url}`);
        const response = await fetchWithRetry(url);
        if (!response.ok) {
            // 404 = token not found or no pools — not an error
            if (response.status === 404)
                break;
            if (page === 1) {
                throw new Error(`GeckoTerminal API error: ${response.status}`);
            }
            break;
        }
        const data = (await response.json());
        const pageData = data.data || [];
        if (pageData.length === 0)
            break;
        for (const pool of pageData) {
            const attrs = pool.attributes;
            const tvl = parseFloat(attrs.reserve_in_usd) || null;
            if (minTvl > 0 && (tvl === null || tvl < minTvl))
                continue;
            let version = 'V2';
            const dexName = attrs.dex || '';
            if (dexName.includes('v4'))
                version = 'V4';
            else if (dexName.includes('v3'))
                version = 'V3';
            else if (dexName.includes('balancer'))
                version = 'Balancer';
            const feeMatch = attrs.name?.match(/(\d+\.?\d*)%/);
            const fee = feeMatch ? feeMatch[1] + '%' : undefined;
            // Extract base/quote token info from relationships
            const rels = pool.relationships || {};
            const baseTokenId = rels.base_token?.data?.id || '';
            const quoteTokenId = rels.quote_token?.data?.id || '';
            // IDs look like "base_0xaddr" — extract the address
            const baseTokenAddress = baseTokenId.includes('_')
                ? baseTokenId.split('_').pop()
                : '';
            const quoteTokenAddress = quoteTokenId.includes('_')
                ? quoteTokenId.split('_').pop()
                : '';
            // Extract symbols from name (e.g. "ARBME / WETH 0.3%")
            const nameParts = (attrs.name || '').split('/').map((s) => s.trim());
            const baseTokenSymbol = nameParts[0]?.split(/\s/)[0] || '';
            const quoteRaw = nameParts[1] || '';
            const quoteTokenSymbol = quoteRaw.split(/\s/)[0] || '';
            // Determine the target token's price — it might be base or quote
            const basePrice = parseFloat(attrs.base_token_price_usd) || 0;
            const quotePrice = parseFloat(attrs.quote_token_price_usd) || 0;
            const isTargetBase = baseTokenAddress.toLowerCase() === address.toLowerCase();
            const targetTokenPriceUSD = isTargetBase ? basePrice : quotePrice;
            allPools.push({
                name: attrs.name,
                address: attrs.address,
                dex: dexName,
                version,
                fee,
                tvl,
                priceUSD: basePrice,
                targetTokenPriceUSD,
                volume24h: parseFloat(attrs.volume_usd?.h24) || 0,
                priceChange24h: parseFloat(attrs.price_change_percentage?.h24) || 0,
                baseTokenAddress,
                quoteTokenAddress,
                baseTokenSymbol,
                quoteTokenSymbol,
            });
        }
    }
    allPools.sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
    const totalTvl = allPools.reduce((sum, p) => sum + (p.tvl || 0), 0);
    return {
        token: address,
        pools: allPools,
        totalPools: allPools.length,
        totalTvl: Math.round(totalTvl * 100) / 100,
        timestamp: new Date().toISOString(),
    };
}
