/**
 * GeckoTerminal client — fetches pool data for any Base token
 */
export interface GeckoPool {
    name: string;
    address: string;
    dex: string;
    version: string;
    fee: string | undefined;
    tvl: number | null;
    priceUSD: number;
    /** Price of the target token in this pool (handles base/quote flip) */
    targetTokenPriceUSD: number;
    volume24h: number;
    priceChange24h: number;
    baseTokenAddress: string;
    quoteTokenAddress: string;
    baseTokenSymbol: string;
    quoteTokenSymbol: string;
}
export interface PoolFetchResult {
    token: string;
    pools: GeckoPool[];
    totalPools: number;
    totalTvl: number;
    timestamp: string;
}
/**
 * Fetch all pools for a token from GeckoTerminal.
 * Fetches up to 3 pages (60 pools) to get comprehensive coverage.
 */
export declare function fetchPoolsForToken(address: string, minTvl?: number, verbose?: boolean): Promise<PoolFetchResult>;
