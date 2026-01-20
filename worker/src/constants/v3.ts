/**
 * Uniswap V3 Constants
 */

// ═══════════════════════════════════════════════════════════════════════════════
// V3 Contract Addresses (Base Mainnet)
// Uniswap V3 contracts for concentrated liquidity
// ═══════════════════════════════════════════════════════════════════════════════

// NonfungiblePositionManager - manages V3 liquidity positions as NFTs
// https://basescan.org/address/0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
export const V3_POSITION_MANAGER = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";

// SwapRouter02 - handles V3 swaps with optimized routing
// https://basescan.org/address/0x2626664c2603336E57B271c5C0b26F421741e481
export const V3_SWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";

// ═══════════════════════════════════════════════════════════════════════════════
// V3 Function Selectors
// ═══════════════════════════════════════════════════════════════════════════════

export const V3_SELECTORS = {
  // NonfungiblePositionManager
  positions: "0x99fbab88",          // positions(uint256) → (12 return values)
  decreaseLiquidity: "0x0c49ccbe",  // decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))
  collect: "0xfc6f7865",            // collect((uint256,address,uint128,uint128))
  mint: "0x88316456",               // mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))
  increaseLiquidity: "0x219f5d17", // increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))
};

// ═══════════════════════════════════════════════════════════════════════════════
// V3 Fee Tiers
// ═══════════════════════════════════════════════════════════════════════════════

export const V3_FEE_TIERS = {
  LOWEST: 100,    // 0.01%
  LOW: 500,       // 0.05%
  MEDIUM: 3000,   // 0.30%
  HIGH: 10000,    // 1.00%
};

// Fee to tick spacing mapping
export const V3_TICK_SPACINGS: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};
