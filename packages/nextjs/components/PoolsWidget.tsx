/**
 * ARBME Pools Widget
 * Leaderboard-style display of ARBME pools with sortable metrics
 * Includes subtle spread indicator for power users
 */

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchPools } from '@/services/api';
import type { Pool, PoolsResponse } from '@/utils/types';
import styles from './PoolsWidget.module.css';

type SortKey = 'tvl' | 'volume' | 'heat' | 'change' | 'spread';

interface PoolWithMetrics extends Pool {
  heat: number;      // Vol/TVL ratio (capital efficiency)
  spread: number;    // % deviation from WETH reference price
}

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
  const router = useRouter();
  const [data, setData] = useState<PoolsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('tvl');

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

  // Format spread percentage
  const formatSpread = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  // Format heat (Vol/TVL ratio)
  const formatHeat = (value: number): string => {
    return `${value.toFixed(0)}%`;
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

    // RATCHET price
    if (symbolUpper === 'RATCHET' || symbolUpper === '$RATCHET') {
      return responseData.ratchetPrice ? parseFloat(responseData.ratchetPrice) : null;
    }

    // ABC price
    if (symbolUpper === 'ABC' || symbolUpper === '$ABC') {
      return responseData.abcPrice ? parseFloat(responseData.abcPrice) : null;
    }

    // CLAWD price
    if (symbolUpper === 'CLAWD' || symbolUpper === '$CLAWD') {
      return responseData.clawdPrice ? parseFloat(responseData.clawdPrice) : null;
    }

    // USDC is always $1
    if (symbolUpper === 'USDC') return 1;

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

  // Compute ARBME-only pools with derived metrics
  const poolsWithMetrics: PoolWithMetrics[] = useMemo(() => {
    if (!data?.pools) return [];

    // Reference price: ARBME/WETH V4 pool price (in USD)
    // Both arbmePrice and pool.priceUsd are USD from GeckoTerminal
    const wethRefPrice = data.arbmePrice ? parseFloat(data.arbmePrice) : 0;

    return data.pools
      // Filter to ARBME-only pools with meaningful TVL (> $1)
      .filter(pool => pool.pair.toUpperCase().includes('ARBME') && pool.tvl > 1)
      .map(pool => {
        // Heat = Vol/TVL ratio as percentage (capital efficiency)
        const heat = pool.tvl > 0 ? (pool.volume24h / pool.tvl) * 100 : 0;

        // Spread = % deviation from WETH reference price
        // Both prices are in USD, so directly comparable
        const poolArbmePrice = parseFloat(pool.priceUsd) || 0;
        const spread = wethRefPrice > 0
          ? ((poolArbmePrice - wethRefPrice) / wethRefPrice) * 100
          : 0;

        return { ...pool, heat, spread };
      });
  }, [data]);

  // Sort pools based on selected metric
  const sortedPools = useMemo(() => {
    const sorted = [...poolsWithMetrics];

    switch (sortBy) {
      case 'tvl':
        sorted.sort((a, b) => b.tvl - a.tvl);
        break;
      case 'volume':
        sorted.sort((a, b) => b.volume24h - a.volume24h);
        break;
      case 'heat':
        sorted.sort((a, b) => b.heat - a.heat);
        break;
      case 'change':
        sorted.sort((a, b) => b.priceChange24h - a.priceChange24h);
        break;
      case 'spread':
        // Sort by absolute spread (biggest deviation first)
        sorted.sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread));
        break;
    }

    return limit ? sorted.slice(0, limit) : sorted;
  }, [poolsWithMetrics, sortBy, limit]);

  // Generate spread tooltip text
  const getSpreadTooltip = (spread: number): string => {
    const direction = spread >= 0 ? 'above' : 'below';
    const absSpread = Math.abs(spread).toFixed(1);
    return `Trading ${absSpread}% ${direction} WETH reference. Experienced traders may find opportunity here.`;
  };

  // Build trade page URL with pool params
  const getTradeUrl = (pool: PoolWithMetrics): string => {
    const params = new URLSearchParams();
    if (pool.token0) params.set('t0', pool.token0);
    if (pool.token1) params.set('t1', pool.token1);

    // Detect version from dex field
    let version = 'V4';
    if (pool.dex.includes('V2')) version = 'V2';
    else if (pool.dex.includes('V3')) version = 'V3';
    params.set('v', version);

    if (pool.fee) params.set('fee', pool.fee.toString());
    params.set('pair', pool.pair);

    return `/trade/${pool.pairAddress}?${params.toString()}`;
  };

  // Navigate to trade page
  const handleTrade = (e: React.MouseEvent, pool: PoolWithMetrics) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(getTradeUrl(pool));
  };

  if (loading) {
    return <div className={styles.loading}>Loading pools...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (!data?.pools || sortedPools.length === 0) {
    return (
      <div className={styles.empty}>
        No ARBME pools found yet. Be the first to LP!
        <p className={styles.hint}>If you believe this is an error, refresh to try again.</p>
      </div>
    );
  }

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'tvl', label: 'TVL' },
    { key: 'volume', label: 'Volume' },
    { key: 'heat', label: 'Heat' },
    { key: 'change', label: '24h' },
    { key: 'spread', label: 'Spread' },
  ];

  return (
    <div className={styles.widget}>
      {/* Sort controls */}
      <div className={styles.sortBar}>
        <span className={styles.sortLabel}>Sort:</span>
        {sortOptions.map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.sortBtn} ${sortBy === key ? styles.sortBtnActive : ''}`}
            onClick={() => setSortBy(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {sortedPools.map((pool) => {
          const tokens = parseTokensFromPair(pool.pair);
          const token0Price = getTokenPrice(tokens.token0 || undefined, data);
          const token1Price = getTokenPrice(tokens.token1 || undefined, data);
          const changeClass = pool.priceChange24h >= 0 ? styles.positive : styles.negative;
          const spreadClass = pool.spread >= 0 ? styles.spreadPositive : styles.spreadNegative;

          return (
            <a
              key={pool.pairAddress}
              href={pool.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.card}
            >
              <div className={styles.cardTop}>
                <div className={styles.pair}>{pool.pair}</div>
                <span className={styles.dex}>{formatDex(pool.dex)}</span>
              </div>
              <div className={styles.cardStats}>
                <div className={styles.statCol}>
                  <span className={styles.statLabel}>TVL</span>
                  <span className={styles.tvl}>{formatUsd(pool.tvl)}</span>
                </div>
                <div className={styles.statCol}>
                  <span className={styles.statLabel}>24h Vol</span>
                  <span className={styles.volume}>{formatUsd(pool.volume24h)}</span>
                </div>
                <div className={styles.statCol}>
                  <span className={styles.statLabel}>Heat</span>
                  <span className={styles.heat}>{formatHeat(pool.heat)}</span>
                </div>
                <div className={styles.statCol}>
                  <span className={styles.statLabel}>24h</span>
                  <span className={`${styles.change} ${changeClass}`}>
                    {formatChange(pool.priceChange24h)}
                  </span>
                </div>
                <div className={styles.statCol}>
                  <span className={styles.statLabel}>Spread</span>
                  <span
                    className={`${styles.spread} ${spreadClass}`}
                    title={getSpreadTooltip(pool.spread)}
                  >
                    {formatSpread(pool.spread)}
                    <span className={styles.infoIcon}>ⓘ</span>
                  </span>
                </div>
              </div>
              {showPrices && (token0Price !== null || token1Price !== null) && (
                <div className={styles.cardPrices}>
                  {token0Price !== null && (
                    <span className={styles.tokenPrice}>
                      {tokens.token0}: {formatPrice(token0Price)}
                    </span>
                  )}
                  {token1Price !== null && (
                    <span className={styles.tokenPrice}>
                      {tokens.token1}: {formatPrice(token1Price)}
                    </span>
                  )}
                </div>
              )}
              <div className={styles.cardActions}>
                <button
                  className={styles.tradeBtn}
                  onClick={(e) => handleTrade(e, pool)}
                >
                  Trade
                </button>
              </div>
            </a>
          );
        })}
      </div>
      {data.lastUpdated && (
        <div className={styles.updated}>
          Last updated: {new Date(data.lastUpdated).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
