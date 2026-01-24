/**
 * Pool Creation Module
 * Handles Uniswap V2/V3/V4 pool creation and liquidity provision
 */
export type Address = `0x${string}`;
interface Transaction {
    to: Address;
    data: string;
    value: string;
}
export interface V4CreatePoolParams {
    token0: Address;
    token1: Address;
    fee: number;
    sqrtPriceX96: bigint;
    amount0: string;
    amount1: string;
    recipient: Address;
    slippageTolerance?: number;
}
export interface V3CreatePoolParams {
    token0: Address;
    token1: Address;
    fee: number;
    sqrtPriceX96: bigint;
    amount0: string;
    amount1: string;
    recipient: Address;
    slippageTolerance?: number;
}
export interface V2CreatePoolParams {
    tokenA: Address;
    tokenB: Address;
    amountA: string;
    amountB: string;
    recipient: Address;
    slippageTolerance?: number;
}
export declare const V2_FACTORY: Address;
export declare const V2_ROUTER: Address;
export declare const V3_FACTORY: Address;
export declare const V3_POSITION_MANAGER: Address;
export declare const V4_POOL_MANAGER: Address;
export declare const V4_POSITION_MANAGER: Address;
export declare const V4_STATE_VIEW: Address;
/**
 * Convert price ratio to Q64.96 sqrt price format
 * @param price - Price as token1/token0 ratio (where token0 < token1)
 * @returns sqrtPriceX96 as bigint
 */
export declare function calculateSqrtPriceX96(price: number): bigint;
/**
 * Sort tokens lexicographically (required for V3/V4)
 * @returns [token0, token1] where token0 < token1
 */
export declare function sortTokens(tokenA: Address, tokenB: Address): [Address, Address];
/**
 * Calculate min/max tick for a given tick spacing
 */
export declare function getTickRange(tickSpacing: number): {
    minTick: number;
    maxTick: number;
};
/**
 * Set the Alchemy API key for RPC calls
 * Call this before using pool creation functions
 */
export declare function setAlchemyKey(key: string | undefined): void;
/**
 * Get token decimals via eth_call
 */
export declare function getTokenDecimals(address: Address): Promise<number>;
/**
 * Get token symbol via eth_call
 */
export declare function getTokenSymbol(address: Address): Promise<string>;
/**
 * Get token name via eth_call
 */
export declare function getTokenName(address: Address): Promise<string>;
/**
 * Get ERC20 allowance
 */
export declare function getTokenAllowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
/**
 * Check if V2 pool exists
 */
export declare function checkV2PoolExists(token0: Address, token1: Address): Promise<{
    exists: boolean;
    pair?: Address;
}>;
/**
 * Check if V3 pool exists
 */
export declare function checkV3PoolExists(token0: Address, token1: Address, fee: number): Promise<{
    exists: boolean;
    pool?: Address;
}>;
/**
 * Check if V4 pool exists (via StateView getSlot0)
 */
export declare function checkV4PoolExists(token0: Address, token1: Address, fee: number, tickSpacing: number): Promise<{
    exists: boolean;
    initialized: boolean;
}>;
/**
 * Build ERC20 approval transaction
 */
export declare function buildApproveTransaction(token: Address, spender: Address): Transaction;
/**
 * Build V4 pool initialization transaction
 */
export declare function buildV4InitializePoolTransaction(params: V4CreatePoolParams): Transaction;
/**
 * Build V4 mint position transaction (full range)
 */
export declare function buildV4MintPositionTransaction(params: V4CreatePoolParams): Transaction;
/**
 * Build V3 pool initialization transaction
 */
export declare function buildV3InitializePoolTransaction(params: V3CreatePoolParams): Transaction;
/**
 * Build V3 mint position transaction (full range)
 */
export declare function buildV3MintPositionTransaction(params: V3CreatePoolParams): Transaction;
/**
 * Build V2 create pool & add liquidity transaction
 */
export declare function buildV2CreatePoolTransaction(params: V2CreatePoolParams): Transaction;
export {};
