/**
 * Pool Fetching Logic for Railway Server
 * Ported from worker/src/index.ts
 */
export interface PoolData {
    pair: string;
    pairAddress: string;
    dex: string;
    tvl: number;
    volume24h: number;
    priceUsd: string;
    priceChange24h: number;
    url: string;
    source: string;
    token0?: string;
    token1?: string;
    token0Logo?: string;
    token1Logo?: string;
    fee?: number;
}
/**
 * Fetch all ARBME pools
 */
export declare function fetchPools(alchemyKey?: string): Promise<{
    token: string;
    poolCount: number;
    totalTvl: number;
    arbmePrice: string;
    tokenPrices: Record<string, number>;
    pools: PoolData[];
    lastUpdated: string;
}>;
