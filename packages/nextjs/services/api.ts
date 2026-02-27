/**
 * API service for fetching data from Next.js API routes
 */

import type { PoolsResponse, TokenPoolsResponse, PricesResponse, Position, PositionSummary } from '../utils/types';

const API_BASE = '/api';

/**
 * Fetch all pools (legacy — used by MCP server backward compat)
 */
export async function fetchPools(): Promise<PoolsResponse> {
  const res = await fetch(`${API_BASE}/pools`);
  if (!res.ok) {
    throw new Error(`Failed to fetch pools: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch pools for a specific token tab
 */
export async function fetchPoolsByToken(token: 'arbme' | 'chaos' | 'ratchet'): Promise<TokenPoolsResponse> {
  const res = await fetch(`${API_BASE}/pools/${token}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${token} pools: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch lightweight price data for the header stats banner
 */
export async function fetchTokenPricesOnly(): Promise<PricesResponse> {
  const res = await fetch(`${API_BASE}/pools/prices`);
  if (!res.ok) {
    throw new Error(`Failed to fetch prices: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch position summaries (fast discovery, no USD enrichment)
 */
export async function fetchPositionSummaries(wallet: string): Promise<PositionSummary[]> {
  const res = await fetch(`${API_BASE}/positions?wallet=${encodeURIComponent(wallet)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch positions: ${res.statusText}`);
  }
  const data = await res.json();
  return data.summaries || [];
}

/**
 * Fetch user's LP positions (fully enriched — backward compat)
 */
export async function fetchPositions(wallet: string): Promise<Position[]> {
  const res = await fetch(`${API_BASE}/positions?wallet=${encodeURIComponent(wallet)}&mode=full`);
  if (!res.ok) {
    throw new Error(`Failed to fetch positions: ${res.statusText}`);
  }
  const data = await res.json();
  return data.positions || [];
}

/**
 * Fetch single enriched position
 */
export async function fetchPosition(id: string, wallet: string): Promise<Position> {
  const res = await fetch(`${API_BASE}/positions/${encodeURIComponent(id)}?wallet=${encodeURIComponent(wallet)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch position: ${res.statusText}`);
  }
  const data = await res.json();
  return data.position;
}

/**
 * Build fee collection transaction
 */
export async function buildCollectFeesTransaction(positionId: string, recipient: string): Promise<{
  to: string;
  data: string;
  value: string;
}> {
  const res = await fetch(`${API_BASE}/collect-fees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ positionId, recipient }),
  });

  if (!res.ok) {
    throw new Error(`Failed to build transaction: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Build increase liquidity transaction
 */
export async function buildIncreaseLiquidityTransaction(
  positionId: string,
  amount0Desired: string,
  amount1Desired: string,
  slippageTolerance?: number
): Promise<{
  to: string;
  data: string;
  value: string;
}> {
  const res = await fetch(`${API_BASE}/increase-liquidity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ positionId, amount0Desired, amount1Desired, slippageTolerance }),
  });

  if (!res.ok) {
    throw new Error(`Failed to build transaction: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Build decrease liquidity transaction
 */
export async function buildDecreaseLiquidityTransaction(
  positionId: string,
  liquidityPercentage: number,
  currentLiquidity: string,
  slippageTolerance?: number
): Promise<{
  to: string;
  data: string;
  value: string;
}> {
  const res = await fetch(`${API_BASE}/decrease-liquidity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ positionId, liquidityPercentage, currentLiquidity, slippageTolerance }),
  });

  if (!res.ok) {
    throw new Error(`Failed to build transaction: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Build burn position transaction
 */
export async function buildBurnPositionTransaction(positionId: string): Promise<{
  to: string;
  data: string;
  value: string;
}> {
  const res = await fetch(`${API_BASE}/burn-position`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ positionId }),
  });

  if (!res.ok) {
    throw new Error(`Failed to build transaction: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch token info (symbol, name, decimals)
 */
export async function fetchTokenInfo(address: string): Promise<{
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}> {
  const res = await fetch(`${API_BASE}/token-info?address=${address}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch token info: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Check if a pool exists
 */
export async function checkPoolExists(params: {
  version: string;
  token0: string;
  token1: string;
  fee?: number;
}): Promise<{
  exists: boolean;
  poolAddress?: string;
  initialized?: boolean;
}> {
  const res = await fetch(`${API_BASE}/check-pool-exists`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Failed to check pool exists: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Check token approvals
 */
export async function checkApprovals(params: {
  token0: string;
  token1: string;
  owner: string;
  spender: string;
  amount0Required: string;
  amount1Required: string;
}): Promise<{
  token0NeedsApproval: boolean;
  token1NeedsApproval: boolean;
  token0Allowance: string;
  token1Allowance: string;
}> {
  const res = await fetch(`${API_BASE}/check-approvals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Failed to check approvals: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Build approval transaction
 */
export async function buildApprovalTransaction(
  token: string,
  spender: string,
  amount?: string,
  unlimited?: boolean
): Promise<{
  to: string;
  data: string;
  value: string;
  approvalAmount: string;
  isUnlimited: boolean;
}> {
  const res = await fetch(`${API_BASE}/build-approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, spender, amount, unlimited }),
  });

  if (!res.ok) {
    throw new Error(`Failed to build approval: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Build create pool transaction(s)
 */
export async function buildCreatePoolTransaction(params: {
  version: string;
  token0: string;
  token1: string;
  amount0: string;
  amount1: string;
  fee?: number;
  price: number;
  recipient: string;
  slippageTolerance?: number;
}): Promise<{
  transactions: Array<{
    to: string;
    data: string;
    value: string;
  }>;
}> {
  const res = await fetch(`${API_BASE}/build-create-pool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Failed to build create pool transaction: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch token balance for wallet
 */
export async function fetchTokenBalance(
  tokenAddress: string,
  walletAddress: string
): Promise<{
  balanceWei: string;
  balanceFormatted: string;
  decimals: number;
}> {
  const res = await fetch(`${API_BASE}/token-balance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tokenAddress, walletAddress }),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch token balance: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch pool price
 */
export async function fetchPoolPrice(params: {
  version: string;
  token0: string;
  token1: string;
  fee?: number;
}): Promise<{
  exists: boolean;
  price?: number;
  priceDisplay?: string;
  token0Symbol?: string;
  token1Symbol?: string;
}> {
  const res = await fetch(`${API_BASE}/pool-price`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch pool price: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Calculate liquidity ratio
 */
export async function calculateLiquidityRatio(params: {
  version: string;
  token0: string;
  token1: string;
  fee?: number;
  amount0?: string;
  amount1?: string;
  decimals0: number;
  decimals1: number;
}): Promise<{
  amount0: string;
  amount1: string;
  price: number;
  priceDisplay: string;
}> {
  const res = await fetch(`${API_BASE}/calculate-ratio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Failed to calculate ratio: ${res.statusText}`);
  }

  return res.json();
}
