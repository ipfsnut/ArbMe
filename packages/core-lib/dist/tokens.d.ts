/**
 * Token metadata and price fetching service
 */
interface TokenMetadata {
    symbol: string;
    decimals: number;
    address: string;
}
/**
 * Fetch token metadata (symbol, decimals) from chain
 */
export declare function getTokenMetadata(tokenAddress: string, alchemyKey?: string): Promise<TokenMetadata>;
/**
 * Fetch token price from GeckoTerminal
 */
export declare function getTokenPrice(tokenAddress: string): Promise<number>;
/**
 * Fetch prices for multiple tokens in batch
 */
export declare function getTokenPrices(tokenAddresses: string[]): Promise<Map<string, number>>;
/**
 * Format token amount with proper decimals
 */
export declare function formatTokenAmount(amount: bigint, decimals: number): string;
/**
 * Calculate USD value from token amount
 */
export declare function calculateUsdValue(amount: bigint, decimals: number, priceUsd: number): number;
export {};
