/**
 * Core type definitions for ArbMe miniapp
 */

export interface Pool {
  id?: string;
  pair: string;
  pairAddress: string;
  dex: string;
  tvl: number;
  volume24h: number;
  priceUsd: string;
  priceChange24h: number;
  url: string;
  source: string;
  token0?: string;
  token1?: string;
  token0Logo?: string;
  token1Logo?: string;
  fee?: number;
}

export interface PoolsResponse {
  token: string;
  poolCount: number;
  totalTvl: number;
  arbmePrice: string;
  ratchetPrice: string;
  abcPrice: string;
  clawdPrice: string;
  arbmeTvl: number;
  ratchetTvl: number;
  abcTvl: number;
  clawdTvl: number;
  tokenPrices: {
    PAGE: number;
    OINC: number;
    CLANKER: number;
    WETH: number;
  };
  pools: Pool[];
  lastUpdated: string;
}

export interface TokenPoolsResponse {
  pools: Pool[];
  tokenPrice: string;
  tvl: number;
  lastUpdated: string;
}

export interface PricesResponse {
  arbmePrice: string;
  chaosPrice: string;
  ratchetPrice: string;
  arbmeTvl: number;
  chaosTvl: number;
  ratchetTvl: number;
  totalTvl: number;
  lastUpdated: string;
}

export interface GlobalStats {
  arbmePrice: string;
  chaosPrice: string;
  ratchetPrice: string;
  totalTvl: number;
  arbmeTvl: number;
  chaosTvl: number;
  ratchetTvl: number;
  // Legacy fields kept for backward compat
  abcPrice: string;
  clawdPrice: string;
  abcTvl: number;
  clawdTvl: number;
}

export interface Position {
  id: string;
  version: 'V2' | 'V3' | 'V4';
  pair: string;
  poolAddress?: string;
  token0: {
    symbol: string;
    address?: string;
    amount: number;
    decimals?: number;
  };
  token1: {
    symbol: string;
    address?: string;
    amount: number;
    decimals?: number;
  };
  liquidity?: string;
  liquidityUsd: number;
  feesEarned?: string;
  feesEarnedUsd: number;
  priceRange?: {
    min: number;
    max: number;
  };
  inRange?: boolean;
  tokenId?: string; // For V3/V4 NFT positions
  fee?: number; // Fee tier for V3/V4 positions
  tickSpacing?: number; // Tick spacing for V4 positions
  hooks?: string; // Hooks address for V4 positions
}

export interface PositionSummary {
  id: string;
  version: 'V2' | 'V3' | 'V4';
  pair: string;
  poolAddress: string;
  token0: { symbol: string; address: string; decimals: number };
  token1: { symbol: string; address: string; decimals: number };
  tokenId?: string;
  fee?: number;
  tickSpacing?: number;
  hooks?: string;
  liquidityRaw: string;
}

export interface AppState {
  wallet: string | null;
  pools: Pool[];
  positions: Position[];
  globalStats: GlobalStats | null;
  loading: boolean;
  error: string | null;
}
