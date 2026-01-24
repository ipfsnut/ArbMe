/**
 * Core type definitions for ArbMe miniapp
 */

export interface Pool {
  id: string;
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
  tokenPrices: {
    PAGE: number;
    OINC: number;
    CLANKER: number;
    WETH: number;
  };
  pools: Pool[];
  lastUpdated: string;
}

export interface GlobalStats {
  arbmePrice: string;
  totalTvl: number;
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
  };
  token1: {
    symbol: string;
    address?: string;
    amount: number;
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

export interface AppState {
  wallet: string | null;
  pools: Pool[];
  positions: Position[];
  globalStats: GlobalStats | null;
  loading: boolean;
  error: string | null;
}
