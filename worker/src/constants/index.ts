/**
 * Constants Index - Re-exports all constants for convenience
 */

// Token metadata (single source of truth)
export {
  TOKEN_METADATA,
  TOKEN_BY_ADDRESS,
  TOKEN_SYMBOLS,
  TOKENS,
  getTokenDecimals,
  getTokenSymbol,
  getTokenSymbolBackend,
  getTokenMetadata,
  getTokenIcon,
  getTokenColor,
  toSafeDecimals,
  toSafeDecimalsWithFallback,
  formatFromRaw,
  toRawAmount,
  toRawAmountWithBuffer,
  type TokenMetadata,
} from './tokens';

// Common/shared constants
export {
  CORS_HEADERS,
  ARBME,
  GECKO_API,
  DEFAULT_TIMEOUT,
  RPC_TIMEOUT,
  GECKO_TIMEOUT,
  TOKEN_PRICE_CACHE_KEY,
  TOKEN_PRICE_CACHE_TTL,
  BASE_RPCS_FALLBACK,
  ERC20_SELECTORS,
  ERC721_SELECTORS,
  ARBME_TIP_WALLET,
} from './common';

// V2 constants
export {
  V2_ROUTER,
  V2_FACTORY,
  V2_SELECTORS,
  PAGE_ARBME_POOL,
  V2_ARBME_POOLS,
  type V2PoolConfig,
} from './v2';

// V3 constants
export {
  V3_POSITION_MANAGER,
  V3_SWAP_ROUTER,
  V3_SELECTORS,
  V3_FEE_TIERS,
  V3_TICK_SPACINGS,
} from './v3';

// V4 constants
export {
  STATE_VIEW,
  POOL_MANAGER,
  V4_POSITION_MANAGER,
  PERMIT2,
  WETH,
  V4_SELECTORS,
  V4_FEE_TIERS,
  V4_TICK_SPACINGS,
  getV4TickSpacing,
  OINC_ARBME_POOL,
  V4_ARBME_POOLS,
  KNOWN_V4_POOLS,
  getKnownPoolId,
  type V4PoolConfig,
} from './v4';

// ═══════════════════════════════════════════════════════════════════════════════
// Combined SELECTORS for backwards compatibility
// ═══════════════════════════════════════════════════════════════════════════════

import { ERC20_SELECTORS, ERC721_SELECTORS } from './common';
import { V2_SELECTORS } from './v2';
import { V3_SELECTORS } from './v3';
import { V4_SELECTORS } from './v4';

export const SELECTORS = {
  // ERC20 Standard
  ...ERC20_SELECTORS,
  // ERC721 Standard
  ...ERC721_SELECTORS,
  // V2 Pair/Router
  getReserves: V2_SELECTORS.getReserves,
  token0: V2_SELECTORS.token0,
  token1: V2_SELECTORS.token1,
  addLiquidity: V2_SELECTORS.addLiquidity,
  removeLiquidity: V2_SELECTORS.removeLiquidity,
  // V3 NonfungiblePositionManager
  v3_positions: V3_SELECTORS.positions,
  v3_decreaseLiquidity: V3_SELECTORS.decreaseLiquidity,
  v3_collect: V3_SELECTORS.collect,
  // V4 PositionManager / StateView
  v4_getPoolAndPositionInfo: V4_SELECTORS.getPoolAndPositionInfo,
  v4_getPositionLiquidity: V4_SELECTORS.getPositionLiquidity,
  v4_getSlot0: V4_SELECTORS.getSlot0,
  v4_getFeeGrowthInside: V4_SELECTORS.getFeeGrowthInside,
  v4_getPositionInfo: V4_SELECTORS.getPositionInfo,
};

// Legacy aliases for backwards compatibility
export const GET_SLOT0 = V4_SELECTORS.getSlot0;
export const BALANCE_OF = ERC20_SELECTORS.balanceOf;
export const GET_RESERVES = V2_SELECTORS.getReserves;
