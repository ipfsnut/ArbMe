/**
 * Reusable Pools Widget Component
 * Displays pools with optional token prices, configurable limit
 */

'use client';

import { useEffect, useState } from 'react';
import { fetchPools } from '@/services/api';
import type { Pool, PoolsResponse } from '@/utils/types';
import styles from './PoolsWidget.module.css';

interface PoolsWidgetProps {
  limit?: number | null;
  showPrices?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onDataLoaded?: (data: PoolsResponse) => void;
}

export default function PoolsWidget({
  limit = null,
  showPrices = true,
  autoRefresh = true,
  refreshInterval = 60000,
  onDataLoaded,
}: PoolsWidgetProps) {
  const [data, setData] = useState<PoolsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Format USD values
  const formatUsd = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-';
    if (value >= 1000000) return '$' + (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return '$' + (value / 1000).toFixed(2) + 'K';
    if (value >= 1) return '$' + value.toFixed(2);
    if (value >= 0.01) return '$' + value.toFixed(4);
    return '$' + value.toFixed(6);
  };

  // Format price with appropriate decimals
  const formatPrice = (value: number | string | null | undefined): string => {
    if (value === null || value === undefined) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    if (num >= 1000) return '$' + num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (num >= 1) return '$' + num.toFixed(4);
    if (num >= 0.0001) return '$' + num.toFixed(6);
    return '$' + num.toFixed(8);
  };

  // Format DEX name
  const formatDex = (dexId: string): string => {
    const dexNames: Record<string, string> = {
      'uniswap': 'Uniswap',
      'uniswap_v2': 'Uniswap V2',
      'uniswap_v3': 'Uniswap V3',
      'uniswap_v4': 'Uniswap V4',
      'aerodrome': 'Aerodrome',
    };
    return dexNames[dexId] || dexId;
  };

  // Format percentage change
  const formatChange = (value: number | undefined): string => {
    if (value === null || value === undefined) return '';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  // Get token price from data - only returns prices we actually have
  const getTokenPrice = (symbol: string | undefined, responseData: PoolsResponse | null): number | null => {
    if (!responseData || !symbol) return null;

    const symbolUpper = symbol.toUpperCase();

    // Check tokenPrices object from API
    if (responseData.tokenPrices) {
      if (symbolUpper === 'PAGE' && responseData.tokenPrices.PAGE) return responseData.tokenPrices.PAGE;
      if (symbolUpper === 'OINC' && responseData.tokenPrices.OINC) return responseData.tokenPrices.OINC;
      if (symbolUpper === 'CLANKER' && responseData.tokenPrices.CLANKER) return responseData.tokenPrices.CLANKER;
      if ((symbolUpper === 'WETH' || symbolUpper === 'ETH') && responseData.tokenPrices.WETH) {
        return responseData.tokenPrices.WETH;
      }
    }

    // ARBME price
    if (symbolUpper === 'ARBME' || symbolUpper === '$ARBME') {
      return responseData.arbmePrice ? parseFloat(responseData.arbmePrice) : null;
    }

    // Return null for tokens we don't have price data for
    return null;
  };

  // Parse pair string to get token symbols
  const parseTokensFromPair = (pair: string): { token0: string | null; token1: string | null } => {
    if (!pair) return { token0: null, token1: null };
    const parts = pair.split('/');
    return {
      token0: parts[0]?.trim() || null,
      token1: parts[1]?.trim() || null,
    };
  };

  // Fetch pools data
  const loadData = async () => {
    try {
      const response = await fetchPools();
      setData(response);
      setError(null);
      if (onDataLoaded) {
        onDataLoaded(response);
      }
    } catch (err) {
      console.error('[PoolsWidget] Failed to fetch pools:', err);
      setError('Failed to load pools');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    if (autoRefresh) {
      const interval = setInterval(loadData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  if (loading) {
    return <div className={styles.loading}>Loading pools...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (!data?.pools || data.pools.length === 0) {
    return <div className={styles.empty}>No pools found yet. Be the first to LP!</div>;
  }

  const pools = limit ? data.pools.slice(0, limit) : data.pools;

  return (
    <div className={styles.widget}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Pair</th>
            <th>DEX</th>
            {showPrices && <th className={styles.pricesHeader}>Token Prices</th>}
            <th>TVL</th>
            <th>24h Vol</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pools.map((pool) => {
            const tokens = parseTokensFromPair(pool.pair);
            const token0Price = getTokenPrice(tokens.token0 || undefined, data);
            const token1Price = getTokenPrice(tokens.token1 || undefined, data);
            const changeClass = pool.priceChange24h >= 0 ? styles.positive : styles.negative;

            return (
              <tr key={pool.id}>
                <td>
                  <div className={styles.pair}>{pool.pair}</div>
                  {pool.priceChange24h !== undefined && (
                    <div className={`${styles.change} ${changeClass}`}>
                      {formatChange(pool.priceChange24h)}
                    </div>
                  )}
                </td>
                <td className={styles.dex}>{formatDex(pool.dex)}</td>
                {showPrices && (
                  <td className={styles.prices}>
                    <span className={styles.tokenPrice}>
                      {tokens.token0}: {token0Price !== null ? formatPrice(token0Price) : '-'}
                    </span>
                    <span className={styles.tokenPrice}>
                      {tokens.token1}: {token1Price !== null ? formatPrice(token1Price) : '-'}
                    </span>
                  </td>
                )}
                <td className={styles.tvl}>{formatUsd(pool.tvl)}</td>
                <td className={styles.volume}>{formatUsd(pool.volume24h)}</td>
                <td>
                  <a
                    href={pool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.link}
                  >
                    View
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.lastUpdated && (
        <div className={styles.updated}>
          Last updated: {new Date(data.lastUpdated).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
