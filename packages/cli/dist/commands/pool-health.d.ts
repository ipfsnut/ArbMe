/**
 * chaos pool-health <token>
 *
 * Scans a Base token's pools via GeckoTerminal and generates a health report
 * with spread analysis, liquidity distribution, fee breakdown, routing assessment,
 * and actionable recommendations.
 */
interface PoolHealthOptions {
    alchemyKey?: string;
    minTvl: string;
    output?: string;
    json?: boolean;
    verbose?: boolean;
}
export declare function poolHealth(token: string, options: PoolHealthOptions): Promise<void>;
export {};
