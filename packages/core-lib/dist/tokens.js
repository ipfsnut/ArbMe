/**
 * Token metadata and price fetching service
 */
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
// Token metadata cache
const tokenCache = new Map();
// Known token addresses on Base (lowercase)
const KNOWN_TOKENS = {
    '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07': {
        symbol: 'ARBME',
        decimals: 18,
        address: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07',
    },
    '0x4200000000000000000000000000000000000006': {
        symbol: 'WETH',
        decimals: 18,
        address: '0x4200000000000000000000000000000000000006',
    },
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
        symbol: 'USDC',
        decimals: 6,
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    },
    '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb': {
        symbol: 'CLANKER',
        decimals: 18,
        address: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb',
    },
    '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42': {
        symbol: 'PAGE',
        decimals: 18,
        address: '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42',
    },
    '0x4ed4e862860bed51a9570b96d89af5e1b0efefed': {
        symbol: 'DEGEN',
        decimals: 18,
        address: '0x4ed4e862860bed51a9570b96d89af5e1b0efefed',
    },
};
const ERC20_ABI = [
    {
        name: 'symbol',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }],
    },
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
    },
];
/**
 * Fetch token metadata (symbol, decimals) from chain
 */
export async function getTokenMetadata(tokenAddress, alchemyKey) {
    const normalizedAddress = tokenAddress.toLowerCase();
    // Check known tokens first
    if (KNOWN_TOKENS[normalizedAddress]) {
        return KNOWN_TOKENS[normalizedAddress];
    }
    // Check cache
    if (tokenCache.has(normalizedAddress)) {
        return tokenCache.get(normalizedAddress);
    }
    // Fetch from chain
    const rpcUrl = alchemyKey
        ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : 'https://mainnet.base.org';
    const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
    });
    try {
        const [symbol, decimals] = await Promise.all([
            client.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'symbol',
            }),
            client.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'decimals',
            }),
        ]);
        const metadata = {
            symbol: symbol,
            decimals: Number(decimals),
            address: tokenAddress,
        };
        // Cache it
        tokenCache.set(normalizedAddress, metadata);
        return metadata;
    }
    catch (error) {
        console.error(`[Tokens] Failed to fetch metadata for ${tokenAddress}:`, error);
        // Return fallback
        return {
            symbol: 'UNKNOWN',
            decimals: 18,
            address: tokenAddress,
        };
    }
}
/**
 * Fetch token price from GeckoTerminal
 */
export async function getTokenPrice(tokenAddress) {
    try {
        const url = `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${tokenAddress}`;
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`[Tokens] GeckoTerminal returned ${response.status} for ${tokenAddress}`);
            return 0;
        }
        const data = await response.json();
        const priceData = data?.data?.attributes?.token_prices?.[tokenAddress.toLowerCase()];
        if (priceData) {
            return parseFloat(priceData);
        }
        return 0;
    }
    catch (error) {
        console.error(`[Tokens] Failed to fetch price for ${tokenAddress}:`, error);
        return 0;
    }
}
/**
 * Fetch prices for multiple tokens in batch
 */
export async function getTokenPrices(tokenAddresses) {
    const prices = new Map();
    console.log(`[Tokens] Fetching prices for ${tokenAddresses.length} tokens from GeckoTerminal...`);
    // GeckoTerminal supports batch queries
    try {
        const addressList = tokenAddresses.join(',');
        const url = `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${addressList}`;
        console.log(`[Tokens] GeckoTerminal URL: ${url}`);
        const response = await fetch(url);
        console.log(`[Tokens] GeckoTerminal response status: ${response.status}`);
        if (!response.ok) {
            console.error(`[Tokens] Batch price fetch failed: ${response.status}`);
            const errorText = await response.text();
            console.error(`[Tokens] Error response: ${errorText}`);
            return prices;
        }
        const data = await response.json();
        const tokenPrices = data?.data?.attributes?.token_prices || {};
        console.log(`[Tokens] GeckoTerminal returned prices for ${Object.keys(tokenPrices).length} tokens`);
        for (const address of tokenAddresses) {
            const normalizedAddress = address.toLowerCase();
            const price = tokenPrices[normalizedAddress];
            if (price) {
                prices.set(normalizedAddress, parseFloat(price));
                console.log(`[Tokens] ${address}: $${parseFloat(price)}`);
            }
            else {
                console.warn(`[Tokens] No price found for ${address}`);
            }
        }
    }
    catch (error) {
        console.error('[Tokens] Batch price fetch failed:', error);
    }
    console.log(`[Tokens] Returning ${prices.size} prices`);
    return prices;
}
/**
 * Format token amount with proper decimals
 */
export function formatTokenAmount(amount, decimals) {
    return formatUnits(amount, decimals);
}
/**
 * Calculate USD value from token amount
 */
export function calculateUsdValue(amount, decimals, priceUsd) {
    const tokenAmount = parseFloat(formatUnits(amount, decimals));
    return tokenAmount * priceUsd;
}
