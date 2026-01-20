/**
 * Build transactions for collecting fees from Uniswap positions
 */
import { Address } from 'viem';
export interface CollectFeesParams {
    positionId: string;
    recipient: string;
}
export interface CollectFeesTransaction {
    to: Address;
    data: `0x${string}`;
    value: string;
}
/**
 * Build a transaction to collect fees from a position
 */
export declare function buildCollectFeesTransaction(params: CollectFeesParams): CollectFeesTransaction;
/**
 * V2 positions don't have separate fee collection - fees are in the LP token value
 */
export declare function canCollectFees(positionVersion: string): boolean;
