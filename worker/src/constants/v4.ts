/**
 * Uniswap V4 Constants
 */

import { TOKEN_METADATA, TOKENS } from './tokens';

const { ARBME, /* USDC, */ cbBTC, CLANKER, PAGE, OINC } = TOKEN_METADATA;

// ═══════════════════════════════════════════════════════════════════════════════
// V4 Contract Addresses (Base Mainnet)
// Uniswap V4 - singleton architecture with hooks support
// ═══════════════════════════════════════════════════════════════════════════════

// StateView - read-only contract to query pool state (slot0, liquidity, etc)
// https://basescan.org/address/0xa3c0c9b65bad0b08107aa264b0f3db444b867a71
export const STATE_VIEW = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71";

// PoolManager - singleton that manages all V4 pools
// https://basescan.org/address/0x498581ff718922c3f8e6a244956af099b2652b2b
export const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";

// PositionManager - manages V4 liquidity positions as NFTs
// https://basescan.org/address/0x7c5f5a4bbd8fd63184577525326123b519429bdc
export const V4_POSITION_MANAGER = "0x7c5f5a4bbd8fd63184577525326123b519429bdc";

// ═══════════════════════════════════════════════════════════════════════════════
// Shared Contracts (used by V4 and other protocols)
// ═══════════════════════════════════════════════════════════════════════════════

// Permit2 - Uniswap's token approval manager (shared across V3/V4)
// https://basescan.org/address/0x000000000022D473030F116dDEE9F6B43aC78BA3
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// WETH - Wrapped ETH on Base (canonical address)
// https://basescan.org/address/0x4200000000000000000000000000000000000006
export const WETH = "0x4200000000000000000000000000000000000006";

// ═══════════════════════════════════════════════════════════════════════════════
// V4 Function Selectors
// ═══════════════════════════════════════════════════════════════════════════════

export const V4_SELECTORS = {
  // PositionManager
  getPoolAndPositionInfo: "0x7ba03aad", // getPoolAndPositionInfo(uint256) → (PoolKey, PositionInfo)
  getPositionLiquidity: "0x1efeed33",   // getPositionLiquidity(uint256) → uint128
  modifyLiquidities: "0xdd46508f",      // modifyLiquidities(bytes,uint256)
  initializePool: "0x3b1daa78",         // initializePool(PoolKey,uint160) → int24
  multicall: "0xac9650d8",              // multicall(bytes[]) → bytes[]
  // StateView
  getSlot0: "0xc815641c",               // getSlot0(bytes32) → (sqrtPriceX96, tick, protocolFee, lpFee)
  getFeeGrowthInside: "0x53e9c1fb",     // getFeeGrowthInside(bytes32,int24,int24) → (uint256, uint256)
  getPositionInfo: "0x97fd7b42",        // getPositionInfo(bytes32,bytes32) → (uint128, uint256, uint256)
};

// ═══════════════════════════════════════════════════════════════════════════════
// V4 Fee Tiers and Tick Spacings
// ═══════════════════════════════════════════════════════════════════════════════

export const V4_FEE_TIERS = {
  LOWEST: 100,      // 0.01%
  LOW: 500,         // 0.05%
  MEDIUM: 3000,     // 0.30%
  HIGH: 10000,      // 1.00%
  VERY_HIGH: 30000, // 3.00%
  EXTREME: 50000,   // 5.00%
};

// V4 on Base uses tickSpacing = 200 for most pools
export const V4_TICK_SPACINGS: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
  30000: 200,
  50000: 200,
};

export function getV4TickSpacing(fee: number): number {
  return V4_TICK_SPACINGS[fee] ?? 200;
}

// ═══════════════════════════════════════════════════════════════════════════════
// V4 Pool Configurations
// All decimals reference TOKEN_METADATA - single source of truth
// ═══════════════════════════════════════════════════════════════════════════════

export interface V4PoolConfig {
  name: string;
  poolId: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  fee: number;
}

// Legacy config for OINC/ARBME pool (for backwards compatibility)
export const OINC_ARBME_POOL = {
  poolId: "0x7c49e36001206a7bb059ceaa5d1ed5485b332eac55fd3efff5e667b72329dd83",
  positionId: 974575,
  token0: OINC.address,
  token1: ARBME.address,
  token0Decimals: OINC.decimals,
  token1Decimals: ARBME.decimals,
  oincAmount: 12306310.02,
  arbmeAmount: 49222105.95,
};

// All V4 ARBME pools
export const V4_ARBME_POOLS: V4PoolConfig[] = [
  // DISABLED: USDC causes incorrect amounts in Uniswap frontend due to 6 decimals
  // {
  //   name: `USDC / ${ARBME.symbol}`,
  //   poolId: "0x3b201840a275805ae6d4576df49027c24f2590c6c7d3aad81834b4d4e2f06bb9",
  //   token0: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  //   token1: ARBME.address,
  //   token0Symbol: "USDC",
  //   token1Symbol: ARBME.symbol,
  //   token0Decimals: 6,
  //   token1Decimals: ARBME.decimals,
  //   fee: 10000,
  // },
  {
    name: `${ARBME.symbol} / ${cbBTC.symbol}`,
    poolId: "0x01a4eaafd201e07ba4ce80488c2a7770019aada7995957592524811364217e2a",
    token0: ARBME.address,
    token1: cbBTC.address,
    token0Symbol: ARBME.symbol,
    token1Symbol: cbBTC.symbol,
    token0Decimals: ARBME.decimals,
    token1Decimals: cbBTC.decimals,
    fee: 10000,
  },
  {
    name: `${CLANKER.symbol} / ${ARBME.symbol}`,
    poolId: "0x10830495714f0463b22fddb2e329e372f3ff86a865f01237cd98e4fc8770311a",
    token0: CLANKER.address,
    token1: ARBME.address,
    token0Symbol: CLANKER.symbol,
    token1Symbol: ARBME.symbol,
    token0Decimals: CLANKER.decimals,
    token1Decimals: ARBME.decimals,
    fee: 30000,
  },
  {
    name: `${PAGE.symbol} / ${ARBME.symbol}`,
    poolId: "0xdf48ea28c119178022522d8d8a15d8529b2b7db17748a264bf630f4ae5bbbda2",
    token0: PAGE.address,
    token1: ARBME.address,
    token0Symbol: PAGE.symbol,
    token1Symbol: ARBME.symbol,
    token0Decimals: PAGE.decimals,
    token1Decimals: ARBME.decimals,
    fee: 30000,
  },
  {
    name: `${PAGE.symbol} / ${ARBME.symbol} (5%)`,
    poolId: "0xcabd040fa6dcdd75ed0e47e0ce19f5db470b0c788a77227edb4ecb466129d2ca",
    token0: PAGE.address,
    token1: ARBME.address,
    token0Symbol: PAGE.symbol,
    token1Symbol: ARBME.symbol,
    token0Decimals: PAGE.decimals,
    token1Decimals: ARBME.decimals,
    fee: 50000,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Known V4 Pools with pre-computed poolIds
// Key format: `${currency0.toLowerCase()}-${currency1.toLowerCase()}-${fee}-${tickSpacing}`
// Note: Token addresses MUST be sorted (currency0 < currency1)
// ═══════════════════════════════════════════════════════════════════════════════

export const KNOWN_V4_POOLS: Record<string, string> = {
  // OINC/ARBME 1% pool
  [`${TOKENS.OINC.toLowerCase()}-${ARBME.address.toLowerCase()}-10000-200`]: "0x7c49e36001206a7bb059ceaa5d1ed5485b332eac55fd3efff5e667b72329dd83",
  // CLANKER/PAGE 1% pool
  ["0x1bc0c42215582d5a085795f4badbac3ff36d1bcb-0xc4730f86d1f86ce0712a7b17ee919db7defad7fe-10000-200"]: "0xe8e9437a8191c59839f82121191a37b424f8417f0b3cfdea3277bfec7e8ffe45",
  // DISABLED: USDC/ARBME 1% pool (USDC has 6 decimals - causes incorrect amounts)
  // ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913-0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07-10000-200"]: "0x3b201840a275805ae6d4576df49027c24f2590c6c7d3aad81834b4d4e2f06bb9",
  // ARBME/cbBTC 1% pool
  ["0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07-0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf-10000-200"]: "0x01a4eaafd201e07ba4ce80488c2a7770019aada7995957592524811364217e2a",
  // CLANKER/ARBME 3% pool
  ["0x1bc0c42215582d5a085795f4badbac3ff36d1bcb-0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07-30000-200"]: "0x10830495714f0463b22fddb2e329e372f3ff86a865f01237cd98e4fc8770311a",
  // PAGE/ARBME 3% pool
  ["0xc4730f86d1f86ce0712a7b17ee919db7defad7fe-0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07-30000-200"]: "0xdf48ea28c119178022522d8d8a15d8529b2b7db17748a264bf630f4ae5bbbda2",
  // PAGE/ARBME 5% pool
  ["0xc4730f86d1f86ce0712a7b17ee919db7defad7fe-0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07-50000-200"]: "0xcabd040fa6dcdd75ed0e47e0ce19f5db470b0c788a77227edb4ecb466129d2ca",
};

/**
 * Get known poolId for a given pool configuration.
 * Returns null if not in our known pools list.
 */
export function getKnownPoolId(
  currency0: string,
  currency1: string,
  fee: number,
  tickSpacing: number
): string | null {
  // Ensure currency0 < currency1 (sorted)
  let c0 = currency0.toLowerCase();
  let c1 = currency1.toLowerCase();
  if (c0 > c1) {
    [c0, c1] = [c1, c0];
  }
  const key = `${c0}-${c1}-${fee}-${tickSpacing}`;
  return KNOWN_V4_POOLS[key] || null;
}
