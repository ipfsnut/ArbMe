/**
 * Real-time price feeds from ArbMe API
 *
 * Uses the existing worker API which already fetches prices from GeckoTerminal
 */
export async function fetchPrices() {
    try {
        const response = await fetch('https://arbme-api.dylan-259.workers.dev/pools', {
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        const data = await response.json();
        return {
            WETH: 3200, // TODO: Add to API response
            CLANKER: data.tokenPrices.CLANKER,
            PAGE: data.tokenPrices.PAGE,
            ARBME_REFERENCE: parseFloat(data.arbmePrice),
        };
    }
    catch (error) {
        console.error('❌ Failed to fetch prices from API:', error instanceof Error ? error.message : error);
        // Fallback to reasonable defaults
        return {
            WETH: 3200,
            CLANKER: 33,
            PAGE: 0.00064,
            ARBME_REFERENCE: 0.00000075,
        };
    }
}
