/**
 * Constants for Pool Fetching
 * Copied from worker/src/constants to avoid import issues
 */
export declare const ARBME: {
    address: "0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07";
    symbol: string;
    decimals: number;
};
export declare const TOKENS: {
    PAGE: string;
    OINC: string;
    CLANKER: string;
};
export declare const GECKO_API = "https://api.geckoterminal.com/api/v2";
export declare const DEFAULT_TIMEOUT = 5000;
export declare const RPC_TIMEOUT = 4000;
export declare const GECKO_TIMEOUT = 6000;
export declare const BASE_RPCS_FALLBACK: string[];
export declare const PAGE_ARBME_POOL: {
    address: string;
    token0: string;
    token1: "0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07";
    fee: number;
};
export declare const V2_ARBME_POOLS: {
    address: string;
    token0: string;
    token1: "0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07";
    fee: number;
}[];
export declare const OINC_ARBME_POOL: {
    token0: string;
    token1: "0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07";
    fee: number;
    tickSpacing: number;
};
export declare const V4_ARBME_POOLS: ({
    token0: string;
    token1: "0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07";
    fee: number;
    tickSpacing: number;
} | {
    token0: string;
    token1: "0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07";
    fee: number;
})[];
export declare const V4_FEE_TIERS: {
    readonly LOWEST: 500;
    readonly LOW: 3000;
    readonly MEDIUM: 10000;
    readonly HIGH: 30000;
    readonly HIGHER: 50000;
    readonly VERY_HIGH: 100000;
    readonly EXTREME: 250000;
    readonly MAX: 500000;
};
export declare const V4_FEE_TIER_LABELS: Record<number, string>;
export declare const FEE_TO_TICK_SPACING: Record<number, number>;
export declare const GET_RESERVES = "0x0902f1ac";
export declare const GET_SLOT0 = "0x3850c7bd";
