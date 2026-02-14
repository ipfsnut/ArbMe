/**
 * Application constants
 */

// ── Core Ecosystem ──────────────────────────────────────────────────────
export const ARBME_ADDRESS = '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07';
export const RATCHET_ADDRESS = '0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07';
export const CHAOS_ADDRESS = '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292';
export const ALPHACLAW_ADDRESS = '0x8C19A8b92FA406Ae097EB9eA8a4A44cBC10EafE2';
export const ABC_ADDRESS = '0x5c0872b790Bb73e2B3A9778Db6E7704095624b07';
export const PAGE_ADDRESS = '0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE';

// ── Connected Tokens ────────────────────────────────────────────────────
export const MLTL_ADDRESS = '0xa448d40f6793773938a6b7427091c35676899125';
export const MOLT_ADDRESS = '0xB695559b26BB2c9703ef1935c37AeaE9526bab07';
export const CLANKER_ADDRESS = '0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb';
export const BNKR_ADDRESS = '0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b';
export const CLAWD_ADDRESS = '0x53aD48291407E16E29822DeB505b30D47F965Ebb';
export const OPENCLAW_ADDRESS = '0xf3bb567d4c79cb32d92b9db151255cdd3b91f04a';
export const WOLF_ADDRESS = '0xc3a366c03a0fc57d96065e3adb27dd0036d83b80';
export const EDGE_ADDRESS = '0x1966a17d806a79f742e6e228ecc9421f401a8a32';
export const OSO_ADDRESS = '0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e';
export const CNEWS_ADDRESS = '0x01de044ad8eb037334ddda97a38bb0c798e4eb07';

// ── Base Assets ─────────────────────────────────────────────────────────
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
export const FLETH_ADDRESS = '0x000000000D564D5be76f7f0d28fE52605afC7Cf8';

/**
 * Featured pools configuration for the frontend.
 * This is a minimal version of the worker's FEATURED_POOLS config.
 * Matches pools by token addresses instead of fragile string matching.
 */
export interface FeaturedPoolConfig {
  id: string;
  displayName: string;
  priority: number;
  token0Address: string;
  token1Address: string;
}

export const FEATURED_POOLS: FeaturedPoolConfig[] = [
  {
    id: 'arbme-weth',
    displayName: 'ARBME / WETH',
    priority: 1,
    token0Address: ARBME_ADDRESS,
    token1Address: WETH_ADDRESS,
  },
  {
    id: 'clanker-arbme',
    displayName: 'CLANKER / ARBME',
    priority: 2,
    token0Address: CLANKER_ADDRESS,
    token1Address: ARBME_ADDRESS,
  },
];

// Foundation
export const CHAOS_FOUNDATION_MULTISIG = '0x3CE26de6FF74e0Baa5F762b67465eEacfE84549F';

// CHAOS Staking Hub + Spokes (update addresses after deployment)
export const CHAOS_STAKING_ADDRESS: string = '0x70e6c917A8AC437E629B67E84C0C0678eD54460d';

// RATCHET First-Staker Campaign (update after deployment)
export const RATCHET_CAMPAIGN_ADDRESS: string = '0x0000000000000000000000000000000000000000';

export interface GaugeConfig {
  symbol: string;
  tokenAddress: string;
  gaugeAddress: string;
  decimals: number;
  pool: string;
  week: number;
}

export const CHAOS_GAUGES: GaugeConfig[] = [
  { symbol: 'ARBME',   tokenAddress: ARBME_ADDRESS,   gaugeAddress: '0x37547710faE12B4be7458b5E87C3106a85CfD72F', decimals: 18, pool: 'CHAOS / ARBME',   week: 1 },
  { symbol: 'USDC',    tokenAddress: USDC_ADDRESS,    gaugeAddress: '0x0000000000000000000000000000000000000000', decimals: 6,  pool: 'CHAOS / USDC',    week: 2 },
  { symbol: 'ALPHACLAW', tokenAddress: ALPHACLAW_ADDRESS, gaugeAddress: '0x0000000000000000000000000000000000000000', decimals: 18, pool: 'CHAOS / ALPHACLAW', week: 3 },
  { symbol: 'MLTL',    tokenAddress: MLTL_ADDRESS,    gaugeAddress: '0x0000000000000000000000000000000000000000', decimals: 18, pool: 'CHAOS / MLTL',    week: 4 },
  { symbol: 'OSO',     tokenAddress: OSO_ADDRESS,     gaugeAddress: '0x0000000000000000000000000000000000000000', decimals: 18, pool: 'CHAOS / OSO',     week: 5 },
  { symbol: 'Cnews',   tokenAddress: CNEWS_ADDRESS,   gaugeAddress: '0x0000000000000000000000000000000000000000', decimals: 18, pool: 'CHAOS / Cnews',   week: 6 },
  { symbol: 'RATCHET', tokenAddress: RATCHET_ADDRESS, gaugeAddress: '0x0000000000000000000000000000000000000000', decimals: 18, pool: 'CHAOS / RATCHET', week: 7 },
];

// Routes
export const ROUTES = {
  LANDING: '/',
  HOME: '/app',
  APP: '/app',
  MY_POOLS: '/positions',
  POSITION_DETAIL: '/positions',
  ADD_LIQUIDITY: '/add-liquidity',
  STAKE: '/stake',
  WRAP: '/wrap',
  TREASURY: '/treasury',
  TRADE: '/trade',
  TRAFFIC: '/traffic',
  CHAOS_THEORY: '/chaostheory',
} as const;

// Position Managers
export const V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';
export const V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
export const V2_ROUTER = '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24';

// V3 only supports these 4 fee tiers (hardcoded in Uniswap V3 contracts)
export const V3_FEE_TIERS = [
  { value: 100, label: '0.01%', description: 'Best for stable pairs' },
  { value: 500, label: '0.05%', description: 'Stable pairs' },
  { value: 3000, label: '0.3%', description: 'Most pairs' },
  { value: 10000, label: '1%', description: 'Exotic pairs' },
] as const;

// V4 allows flexible fee tiers
export const V4_FEE_TIERS = [
  { value: 500, label: '0.05%', description: 'Best for stable pairs' },
  { value: 3000, label: '0.3%', description: 'Best for most pairs' },
  { value: 10000, label: '1%', description: 'Best for exotic pairs' },
  { value: 30000, label: '3%', description: 'High volatility' },
  { value: 50000, label: '5%', description: 'Very high volatility' },
  { value: 100000, label: '10%', description: 'Extreme volatility' },
  { value: 150000, label: '15%', description: 'Ultra volatile' },
  { value: 200000, label: '20%', description: 'Extreme risk' },
  { value: 250000, label: '25%', description: 'Maximum risk' },
  { value: 500000, label: '50%', description: 'Degen mode' },
] as const;

// Legacy export for backwards compatibility (defaults to V4 tiers)
export const FEE_TIERS = V4_FEE_TIERS;
