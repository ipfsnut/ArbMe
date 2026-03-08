/**
 * Application constants
 */

// ── Core Ecosystem ──────────────────────────────────────────────────────
export const ARBME_ADDRESS = '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07';
export const RATCHET_ADDRESS = '0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07';
export const CHAOS_ADDRESS = '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292';
export const CHAOSLP_ADDRESS = '0x8454d062506a27675706148ecdd194e45e44067a';
export const ALPHACLAW_ADDRESS = '0x8C19A8b92FA406Ae097EB9eA8a4A44cBC10EafE2';
export const ABC_ADDRESS = '0x5c0872b790Bb73e2B3A9778Db6E7704095624b07';
export const PAGE_ADDRESS = '0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE';

// ── Connected Tokens ────────────────────────────────────────────────────
export const FLAY_ADDRESS = '0xf1a7000000950c7ad8aff13118bb7ab561a448ee';
export const VIRTUAL_ADDRESS = '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b';
export const CLANKER_ADDRESS = '0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb';
export const BNKR_ADDRESS = '0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b';
export const CNEWS_ADDRESS = '0x01de044ad8eb037334ddda97a38bb0c798e4eb07';
export const VENDYZ_ADDRESS = '0x24245dff20ee3d826f99e1b3f685670166e673dc';

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

// Rails Multisig
export const RAILS_MULTISIG = '0xb7DD467A573809218aAE30EB2c60e8AE3a9198a0';
/** @deprecated Use RAILS_MULTISIG */
export const CHAOS_FOUNDATION_MULTISIG = RAILS_MULTISIG;

// ChaosLP Staking Hub + Gauge Spokes (update addresses after deployment)
export const CHAOS_STAKING_ADDRESS: string = '0x48D9eC58746aD41731De91Efb1e315c8fcF5d20a';

export interface GaugeConfig {
  symbol: string;
  tokenAddress: string;
  gaugeAddress: string;
  decimals: number;
  pool: string;
}

export const CHAOS_GAUGES: GaugeConfig[] = [
  { symbol: 'CHAOSLP', tokenAddress: CHAOSLP_ADDRESS, gaugeAddress: '0x48D9eC58746aD41731De91Efb1e315c8fcF5d20a', decimals: 18, pool: 'Hub Reward' },
  { symbol: 'ARBME',   tokenAddress: ARBME_ADDRESS,   gaugeAddress: '0xecf0307ed8d64cEEc82B1A2488D9c7969c0B26f2', decimals: 18, pool: 'CHAOSLP / ARBME' },
  { symbol: 'CLANKER', tokenAddress: CLANKER_ADDRESS,  gaugeAddress: '0xb9135C878DA7f229E39CD16121B5F7796eE7DB53', decimals: 18, pool: 'CHAOSLP / CLANKER' },
  { symbol: 'FLAY',    tokenAddress: FLAY_ADDRESS,    gaugeAddress: '0xE2aCDb1dea6422671e95500834eBc21dbbDf5F7D', decimals: 18, pool: 'CHAOSLP / FLAY' },
  { symbol: 'VIRTUAL', tokenAddress: VIRTUAL_ADDRESS,  gaugeAddress: '0x839ac3EB369D7f5d55f01Fb13770D515841439d6', decimals: 18, pool: 'CHAOSLP / VIRTUAL' },
  { symbol: 'VENDYZ', tokenAddress: VENDYZ_ADDRESS,   gaugeAddress: '0x0000000000000000000000000000000000000000', decimals: 18, pool: 'CHAOSLP / VENDYZ' },
];

// Routes
export const ROUTES = {
  LANDING: '/',
  HOME: '/app',
  APP: '/app',
  MY_POOLS: '/positions',
  POSITION_DETAIL: '/positions',
  ADD_LIQUIDITY: '/add-liquidity',
  TRADE: '/trade',
  ADVANCED: '/advanced',
  BUILD: '/build',
  TREASURY: '/treasury',
  TRAFFIC: '/traffic',
  WRAP: '/wrap',
  RAILS: '/rails',
  // Legacy (redirected)
  STAKE: '/stake',
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
