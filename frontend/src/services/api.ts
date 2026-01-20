/**
 * API service for fetching data from Railway backend
 */

import type { PoolsResponse, Position } from '../utils/types';
import { API_BASE } from '../utils/constants';

/**
 * Fetch all ARBME pools
 */
export async function fetchPools(): Promise<PoolsResponse> {
  const res = await fetch(`${API_BASE}/pools`);
  if (!res.ok) {
    throw new Error(`Failed to fetch pools: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch user's LP positions
 */
export async function fetchPositions(wallet: string): Promise<Position[]> {
  const res = await fetch(`${API_BASE}/api/positions?wallet=${wallet}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch positions: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch single position details
 */
export async function fetchPosition(id: string, wallet: string): Promise<Position> {
  const res = await fetch(`${API_BASE}/api/position/${id}?wallet=${wallet}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch position: ${res.statusText}`);
  }
  return res.json();
}
