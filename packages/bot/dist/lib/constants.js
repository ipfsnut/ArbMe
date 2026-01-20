/**
 * Constants for Pool Fetching
 * Copied from worker/src/constants to avoid import issues
 */
// ═══════════════════════════════════════════════════════════════════════════════
// ARBME Token
// ═══════════════════════════════════════════════════════════════════════════════
export const ARBME = {
    address: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07',
    symbol: 'ARBME',
    decimals: 18,
};
// ═══════════════════════════════════════════════════════════════════════════════
// Token Addresses
// ═══════════════════════════════════════════════════════════════════════════════
export const TOKENS = {
    PAGE: '0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE',
    OINC: '0x59e058780dd8a6017061596a62288b6438edbe68',
    CLANKER: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb',
};
// ═══════════════════════════════════════════════════════════════════════════════
// External APIs
// ═══════════════════════════════════════════════════════════════════════════════
export const GECKO_API = 'https://api.geckoterminal.com/api/v2';
// ═══════════════════════════════════════════════════════════════════════════════
// Timeouts
// ═══════════════════════════════════════════════════════════════════════════════
export const DEFAULT_TIMEOUT = 5000; // 5 seconds
export const RPC_TIMEOUT = 4000; // 4 seconds for RPC calls
export const GECKO_TIMEOUT = 6000; // 6 seconds for GeckoTerminal
// ═══════════════════════════════════════════════════════════════════════════════
// RPC Fallback List
// ═══════════════════════════════════════════════════════════════════════════════
export const BASE_RPCS_FALLBACK = [
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://base.drpc.org',
    'https://rpc.ankr.com/base',
];
// ═══════════════════════════════════════════════════════════════════════════════
// V2 Pool Configurations
// ═══════════════════════════════════════════════════════════════════════════════
export const PAGE_ARBME_POOL = {
    address: '0x11FD494780ba58550E027ef64C0e36a914FF0F8A',
    token0: TOKENS.PAGE,
    token1: ARBME.address,
    fee: 0.003, // 0.3%
};
export const V2_ARBME_POOLS = [
    PAGE_ARBME_POOL,
    {
        address: '0x14aeb8cfdf477001a60f5196ec2ddfe94771b794',
        token0: TOKENS.CLANKER,
        token1: ARBME.address,
        fee: 0.003,
    },
];
// ═══════════════════════════════════════════════════════════════════════════════
// V4 Pool Configurations
// ═══════════════════════════════════════════════════════════════════════════════
export const OINC_ARBME_POOL = {
    token0: TOKENS.OINC,
    token1: ARBME.address,
    fee: 3000,
    tickSpacing: 60,
};
export const V4_ARBME_POOLS = [
    OINC_ARBME_POOL,
    {
        token0: TOKENS.CLANKER,
        token1: ARBME.address,
        fee: 3000,
    },
];
// ═══════════════════════════════════════════════════════════════════════════════
// Contract Selectors
// ═══════════════════════════════════════════════════════════════════════════════
// V2 getReserves() selector
export const GET_RESERVES = '0x0902f1ac';
// V4 getSlot0 selector (on StateView)
export const GET_SLOT0 = '0x3850c7bd';
