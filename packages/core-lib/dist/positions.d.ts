/**
 * Fetch user's Uniswap positions across V2, V3, and V4
 */
export interface Position {
    id: string;
    version: 'V2' | 'V3' | 'V4';
    pair: string;
    poolAddress: string;
    token0: {
        symbol: string;
        address: string;
        amount: number;
    };
    token1: {
        symbol: string;
        address: string;
        amount: number;
    };
    liquidity: string;
    liquidityUsd: number;
    feesEarned: string;
    feesEarnedUsd: number;
    priceRange?: {
        min: number;
        max: number;
    };
    inRange?: boolean;
    tokenId?: string;
    fee?: number;
    tickSpacing?: number;
    hooks?: string;
}
/**
 * Fetch all positions for a wallet address
 */
export declare function fetchUserPositions(walletAddress: string, alchemyKey?: string): Promise<Position[]>;
