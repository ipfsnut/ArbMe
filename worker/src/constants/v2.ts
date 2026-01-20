/**
 * Uniswap V2 Constants
 */

import { TOKEN_METADATA } from './tokens';

const { PAGE, ARBME, CLANKER } = TOKEN_METADATA;

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Contract Addresses (Base Mainnet)
// Uniswap V2 Router and Factory deployed on Base
// ═══════════════════════════════════════════════════════════════════════════════

// Uniswap V2 Router - handles swaps, adding/removing liquidity
// https://basescan.org/address/0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24
export const V2_ROUTER = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";

// Uniswap V2 Factory - creates and tracks V2 pairs
// https://basescan.org/address/0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6
export const V2_FACTORY = "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6";

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Function Selectors
// ═══════════════════════════════════════════════════════════════════════════════

export const V2_SELECTORS = {
  // Pair
  getReserves: "0x0902f1ac",     // getReserves() → (uint112, uint112, uint32)
  token0: "0x0dfe1681",          // token0() → address
  token1: "0xd21220a7",          // token1() → address
  // Router
  addLiquidity: "0xe8e33700",    // addLiquidity(...)
  removeLiquidity: "0xbaa2abde", // removeLiquidity(...)
};

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Pool Configurations
// All decimals reference TOKEN_METADATA - single source of truth
// ═══════════════════════════════════════════════════════════════════════════════

export interface V2PoolConfig {
  address: string;
  name: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
}

// Legacy config for PAGE/ARBME pool
export const PAGE_ARBME_POOL = {
  address: "0x11FD4947bE07E721B57622df3ef1E1C773ED5655",
  token0: PAGE.address,
  token1: ARBME.address,
  token0Decimals: PAGE.decimals,
  token1Decimals: ARBME.decimals,
};

// All known V2 ARBME pools
export const V2_ARBME_POOLS: V2PoolConfig[] = [
  {
    address: "0x11FD4947bE07E721B57622df3ef1E1C773ED5655",
    name: `${PAGE.symbol} / ${ARBME.symbol}`,
    token0: PAGE.address,
    token1: ARBME.address,
    token0Symbol: PAGE.symbol,
    token1Symbol: ARBME.symbol,
    token0Decimals: PAGE.decimals,
    token1Decimals: ARBME.decimals,
  },
  {
    address: "0x14aeb8cfdf477001a60f5196ec2ddfe94771b794",
    name: `${CLANKER.symbol} / ${ARBME.symbol}`,
    token0: CLANKER.address,
    token1: ARBME.address,
    token0Symbol: CLANKER.symbol,
    token1Symbol: ARBME.symbol,
    token0Decimals: CLANKER.decimals,
    token1Decimals: ARBME.decimals,
  },
];
