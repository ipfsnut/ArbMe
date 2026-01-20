/**
 * On-chain pricing service
 * Calculates token prices from pool reserves/sqrtPriceX96 instead of external APIs
 */
/**
 * Get token price in USD using on-chain pool data
 */
export declare function getTokenPriceOnChain(tokenAddress: string, decimals: number, wethPrice: number, alchemyKey?: string): Promise<number>;
/**
 * Get prices for multiple tokens in batch using on-chain data
 */
export declare function getTokenPricesOnChain(tokens: Array<{
    address: string;
    decimals: number;
}>, alchemyKey?: string): Promise<Map<string, number>>;
