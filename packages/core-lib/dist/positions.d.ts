/**
 * Fetch user's Uniswap positions across V2, V3, and V4
 */
export interface Position {
    id: string;
    version: 'V2' | 'V3' | 'V4';
    pair: string;
    poolAddress: string;
    token0: string;
    token1: string;
    liquidity: string;
    liquidityUsd: number;
    feesEarned: string;
    feesEarnedUsd: number;
    priceRangeLow?: string;
    priceRangeHigh?: string;
    inRange?: boolean;
    tokenId?: string;
    fee?: number;
    tickSpacing?: number;
    hooks?: string;
    v2Balance?: bigint;
    v2TotalSupply?: bigint;
    v2Reserve0?: bigint;
    v2Reserve1?: bigint;
    v3TokensOwed0?: bigint;
    v3TokensOwed1?: bigint;
}
/**
 * Fetch all positions for a wallet address
 */
export declare function fetchUserPositions(walletAddress: string, alchemyKey?: string): Promise<Position[]>;
