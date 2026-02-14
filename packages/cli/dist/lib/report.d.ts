/**
 * Markdown & JSON report generator for pool health checks
 */
import type { GeckoPool } from './gecko.js';
export interface HealthAnalysis {
    token: {
        address: string;
        symbol: string;
        decimals: number;
        priceUSD: number;
    };
    pools: GeckoPool[];
    totalPools: number;
    totalTvl: number;
    totalVolume24h: number;
    spread: {
        min: number;
        max: number;
        median: number;
        spreadPct: number;
    };
    liquidity: {
        topPoolPct: number;
        topPoolName: string;
    };
    feeTiers: Record<string, number>;
    dexBreakdown: Record<string, {
        count: number;
        tvl: number;
    }>;
    routing: {
        hasWethPair: boolean;
        hasUsdcPair: boolean;
        uniqueQuoteTokens: string[];
        bestEntryPool: string;
    };
    healthScore: number;
    recommendations: string[];
    timestamp: string;
}
export declare function generateMarkdownReport(analysis: HealthAnalysis): string;
export declare function generateJsonReport(analysis: HealthAnalysis): string;
export declare function generateEmptyReport(tokenAddress: string, symbol: string): string;
