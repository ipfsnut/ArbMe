/**
 * Market Traffic Dashboard
 * Real-time ecosystem activity monitoring for strategic operations
 */

'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { fetchPools } from '@/services/api';
import type { Pool, PoolsResponse } from '@/utils/types';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { BackButton } from '@/components/BackButton';
import { ROUTES } from '@/utils/constants';
import styles from './traffic.module.css';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface SwapEvent {
  id: string;
  timestamp: string;
  blockNumber: number;
  txHash: string;
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  tokenInInfo?: { symbol: string; decimals: number };
  tokenOutInfo?: { symbol: string; decimals: number };
  formattedAmountIn?: string;
  formattedAmountOut?: string;
  explorerUrl: string;
}

interface FlowData {
  usdcToRatchet: number;
  ratchetToUsdc: number;
  ratchetToArbme: number;
  arbmeToRatchet: number;
  usdcToArbme: number;
  arbmeToUsdc: number;
}

interface PoolWithMetrics extends Pool {
  heat: number;
  spread: number;
}

// Token addresses (lowercase for comparison)
const TRACKED_TOKENS = {
  ARBME: '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07',
  RATCHET: '0x392bc5deea227043d69af0e67badbcbbaed511b07',
  USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  WETH: '0x4200000000000000000000000000000000000006',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Spread Index Component
// ═══════════════════════════════════════════════════════════════════════════════

function SpreadIndex({ pools, mainPrice }: { pools: PoolWithMetrics[]; mainPrice: number }) {
  // Calculate average peripheral ARBME price vs main ARBME/WETH pool
  const arbmePools = pools.filter(p =>
    p.pair.toUpperCase().includes('ARBME') && !p.pair.toUpperCase().includes('WETH')
  );

  const peripheralPrices = arbmePools
    .filter(p => parseFloat(p.priceUsd) > 0)
    .map(p => parseFloat(p.priceUsd));

  const avgPeripheralPrice = peripheralPrices.length > 0
    ? peripheralPrices.reduce((a, b) => a + b, 0) / peripheralPrices.length
    : mainPrice;

  const spreadPercent = mainPrice > 0
    ? ((avgPeripheralPrice - mainPrice) / mainPrice) * 100
    : 0;

  // Determine zone
  let zone: 'BUY' | 'NEUTRAL' | 'SELL' = 'NEUTRAL';
  let zoneColor = 'yellow';

  if (spreadPercent < -3) {
    zone = 'BUY';
    zoneColor = 'green';
  } else if (spreadPercent > 3) {
    zone = 'SELL';
    zoneColor = 'red';
  }

  // Gauge position (clamp between -10% and +10%)
  const gaugePosition = Math.max(-10, Math.min(10, spreadPercent));
  const gaugePercent = ((gaugePosition + 10) / 20) * 100;

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Spread Index</h3>
      <div className={styles.spreadGauge}>
        <div className={styles.gaugeLabels}>
          <span className={styles.buyZone}>BUY ZONE</span>
          <span className={styles.neutral}>NEUTRAL</span>
          <span className={styles.sellZone}>SELL ZONE</span>
        </div>
        <div className={styles.gaugeTrack}>
          <div className={styles.gaugeZones}>
            <div className={styles.zoneGreen} />
            <div className={styles.zoneYellow} />
            <div className={styles.zoneRed} />
          </div>
          <div
            className={styles.gaugeNeedle}
            style={{ left: `${gaugePercent}%` }}
          />
        </div>
        <div className={styles.gaugeScale}>
          <span>-10%</span>
          <span>-3%</span>
          <span>0%</span>
          <span>+3%</span>
          <span>+10%</span>
        </div>
      </div>
      <div className={styles.spreadValue} data-zone={zoneColor}>
        <span className={styles.spreadNumber}>
          {spreadPercent >= 0 ? '+' : ''}{spreadPercent.toFixed(2)}%
        </span>
        <span className={styles.spreadZone}>{zone} ZONE</span>
      </div>
      <p className={styles.spreadHint}>
        Peripheral pools trading {Math.abs(spreadPercent).toFixed(1)}% {spreadPercent >= 0 ? 'above' : 'below'} main pool
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Flow Visualization Component
// ═══════════════════════════════════════════════════════════════════════════════

function FlowVisualization({ flows }: { flows: FlowData }) {
  const maxFlow = Math.max(
    flows.usdcToRatchet, flows.ratchetToUsdc,
    flows.ratchetToArbme, flows.arbmeToRatchet,
    flows.usdcToArbme, flows.arbmeToUsdc,
    1
  );

  const getThickness = (value: number) => {
    const normalized = value / maxFlow;
    return Math.max(2, normalized * 8);
  };

  const formatFlow = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>24h Token Flows</h3>
      <div className={styles.flowDiagram}>
        {/* Token nodes */}
        <div className={styles.flowNodes}>
          <div className={styles.flowNode} data-token="usdc">
            <span className={styles.tokenSymbol}>USDC</span>
          </div>
          <div className={styles.flowNode} data-token="ratchet">
            <span className={styles.tokenSymbol}>RATCHET</span>
          </div>
          <div className={styles.flowNode} data-token="arbme">
            <span className={styles.tokenSymbol}>ARBME</span>
          </div>
        </div>

        {/* Flow arrows */}
        <div className={styles.flowArrows}>
          {/* USDC <-> RATCHET */}
          <div className={styles.flowPair}>
            <div className={styles.flowLabel}>USDC → RATCHET</div>
            <div className={styles.flowArrow} data-direction="right">
              <div
                className={styles.arrowLine}
                style={{ height: `${getThickness(flows.usdcToRatchet)}px` }}
              />
              <span className={styles.flowAmount}>{formatFlow(flows.usdcToRatchet)}</span>
            </div>
            <div className={styles.flowArrow} data-direction="left">
              <div
                className={styles.arrowLine}
                style={{ height: `${getThickness(flows.ratchetToUsdc)}px` }}
              />
              <span className={styles.flowAmount}>{formatFlow(flows.ratchetToUsdc)}</span>
            </div>
            <div className={styles.flowLabel}>RATCHET → USDC</div>
          </div>

          {/* RATCHET <-> ARBME */}
          <div className={styles.flowPair}>
            <div className={styles.flowLabel}>RATCHET → ARBME</div>
            <div className={styles.flowArrow} data-direction="right">
              <div
                className={styles.arrowLine}
                style={{ height: `${getThickness(flows.ratchetToArbme)}px` }}
              />
              <span className={styles.flowAmount}>{formatFlow(flows.ratchetToArbme)}</span>
            </div>
            <div className={styles.flowArrow} data-direction="left">
              <div
                className={styles.arrowLine}
                style={{ height: `${getThickness(flows.arbmeToRatchet)}px` }}
              />
              <span className={styles.flowAmount}>{formatFlow(flows.arbmeToRatchet)}</span>
            </div>
            <div className={styles.flowLabel}>ARBME → RATCHET</div>
          </div>

          {/* USDC <-> ARBME */}
          <div className={styles.flowPair}>
            <div className={styles.flowLabel}>USDC → ARBME</div>
            <div className={styles.flowArrow} data-direction="right">
              <div
                className={styles.arrowLine}
                style={{ height: `${getThickness(flows.usdcToArbme)}px` }}
              />
              <span className={styles.flowAmount}>{formatFlow(flows.usdcToArbme)}</span>
            </div>
            <div className={styles.flowArrow} data-direction="left">
              <div
                className={styles.arrowLine}
                style={{ height: `${getThickness(flows.arbmeToUsdc)}px` }}
              />
              <span className={styles.flowAmount}>{formatFlow(flows.arbmeToUsdc)}</span>
            </div>
            <div className={styles.flowLabel}>ARBME → USDC</div>
          </div>
        </div>

        {/* Net flow summary */}
        <div className={styles.netFlows}>
          <div className={styles.netFlow}>
            <span>Net USDC→RATCHET:</span>
            <span className={flows.usdcToRatchet > flows.ratchetToUsdc ? styles.positive : styles.negative}>
              {formatFlow(flows.usdcToRatchet - flows.ratchetToUsdc)}
            </span>
          </div>
          <div className={styles.netFlow}>
            <span>Net RATCHET→ARBME:</span>
            <span className={flows.ratchetToArbme > flows.arbmeToRatchet ? styles.positive : styles.negative}>
              {formatFlow(flows.ratchetToArbme - flows.arbmeToRatchet)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pool Heat Map Component
// ═══════════════════════════════════════════════════════════════════════════════

function PoolHeatMap({ pools }: { pools: PoolWithMetrics[] }) {
  const [sortBy, setSortBy] = useState<'heat' | 'volume'>('heat');

  const sortedPools = useMemo(() => {
    const sorted = [...pools];
    if (sortBy === 'heat') {
      sorted.sort((a, b) => b.heat - a.heat);
    } else {
      sorted.sort((a, b) => b.volume24h - a.volume24h);
    }
    return sorted;
  }, [pools, sortBy]);

  const maxHeat = Math.max(...pools.map(p => p.heat), 1);

  const getHeatEmojis = (heat: number) => {
    const normalized = heat / maxHeat;
    if (normalized > 0.8) return '🔥🔥🔥';
    if (normalized > 0.5) return '🔥🔥';
    if (normalized > 0.2) return '🔥';
    return '';
  };

  const formatUsd = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Pool Heat Map</h3>
        <div className={styles.sortToggle}>
          <button
            className={`${styles.sortBtn} ${sortBy === 'heat' ? styles.active : ''}`}
            onClick={() => setSortBy('heat')}
          >
            Heat
          </button>
          <button
            className={`${styles.sortBtn} ${sortBy === 'volume' ? styles.active : ''}`}
            onClick={() => setSortBy('volume')}
          >
            Volume
          </button>
        </div>
      </div>

      <div className={styles.heatList}>
        {sortedPools.map((pool, index) => {
          const heatBar = Math.min((pool.heat / maxHeat) * 100, 100);
          const emojis = getHeatEmojis(pool.heat);

          return (
            <div key={pool.pairAddress} className={styles.heatRow}>
              <span className={styles.heatRank}>#{index + 1}</span>
              <div className={styles.heatInfo}>
                <span className={styles.heatPair}>{pool.pair}</span>
                <span className={styles.heatDex}>{pool.dex.replace('_', ' ').toUpperCase()}</span>
              </div>
              <div className={styles.heatBarContainer}>
                <div
                  className={styles.heatBar}
                  style={{ width: `${heatBar}%` }}
                />
              </div>
              <div className={styles.heatStats}>
                <span className={styles.heatValue}>{pool.heat.toFixed(0)}%</span>
                <span className={styles.heatEmoji}>{emojis}</span>
              </div>
              <span className={styles.heatVolume}>{formatUsd(pool.volume24h)}</span>
            </div>
          );
        })}
      </div>

      <p className={styles.heatHint}>
        Heat = 24h Volume / TVL (capital efficiency)
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Live Swaps Feed Component
// ═══════════════════════════════════════════════════════════════════════════════

function LiveSwapsFeed({ swaps, loading }: { swaps: SwapEvent[]; loading: boolean }) {
  const feedRef = useRef<HTMLDivElement>(null);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getDirection = (swap: SwapEvent) => {
    const tokenIn = swap.tokenIn.toLowerCase();
    const tokenOut = swap.tokenOut.toLowerCase();

    // Determine if it's a buy or sell relative to ARBME/RATCHET
    if (tokenOut === TRACKED_TOKENS.ARBME || tokenOut === TRACKED_TOKENS.RATCHET) {
      return 'BUY';
    }
    if (tokenIn === TRACKED_TOKENS.ARBME || tokenIn === TRACKED_TOKENS.RATCHET) {
      return 'SELL';
    }
    return 'SWAP';
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Live Swaps</h3>
        <span className={styles.liveDot}>LIVE</span>
      </div>

      <div className={styles.swapFeed} ref={feedRef}>
        {loading && swaps.length === 0 && (
          <div className={styles.feedLoading}>Waiting for swaps...</div>
        )}

        {swaps.length === 0 && !loading && (
          <div className={styles.feedEmpty}>No recent swaps</div>
        )}

        {swaps.map((swap) => {
          const direction = getDirection(swap);
          const directionClass = direction === 'BUY' ? styles.buy : direction === 'SELL' ? styles.sell : '';

          return (
            <a
              key={swap.id}
              href={swap.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.swapRow}
            >
              <span className={styles.swapTime}>{formatTime(swap.timestamp)}</span>
              <span className={`${styles.swapDirection} ${directionClass}`}>
                {direction}
              </span>
              <span className={styles.swapTokens}>
                <span className={styles.swapAmount}>
                  {swap.formattedAmountIn ? parseFloat(swap.formattedAmountIn).toFixed(2) : '?'}
                </span>
                <span className={styles.swapSymbol}>
                  {swap.tokenInInfo?.symbol || truncateAddress(swap.tokenIn)}
                </span>
                <span className={styles.swapArrow}>→</span>
                <span className={styles.swapAmount}>
                  {swap.formattedAmountOut ? parseFloat(swap.formattedAmountOut).toFixed(2) : '?'}
                </span>
                <span className={styles.swapSymbol}>
                  {swap.tokenOutInfo?.symbol || truncateAddress(swap.tokenOut)}
                </span>
              </span>
              <span className={styles.swapPool}>
                {truncateAddress(swap.poolAddress)}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function TrafficPage() {
  const [poolsData, setPoolsData] = useState<PoolsResponse | null>(null);
  const [swaps, setSwaps] = useState<SwapEvent[]>([]);
  const [flows, setFlows] = useState<FlowData>({
    usdcToRatchet: 0,
    ratchetToUsdc: 0,
    ratchetToArbme: 0,
    arbmeToRatchet: 0,
    usdcToArbme: 0,
    arbmeToUsdc: 0,
  });
  const [loading, setLoading] = useState(true);
  const [swapsLoading, setSwapsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Compute pools with metrics
  const poolsWithMetrics: PoolWithMetrics[] = useMemo(() => {
    if (!poolsData?.pools) return [];

    const refPrice = poolsData.ratchetPrice ? parseFloat(poolsData.ratchetPrice) : 0;

    return poolsData.pools
      .filter(pool =>
        pool.pair.toUpperCase().includes('ARBME') ||
        pool.pair.toUpperCase().includes('RATCHET')
      )
      .map(pool => {
        const heat = pool.tvl > 0 ? (pool.volume24h / pool.tvl) * 100 : 0;
        const poolPrice = parseFloat(pool.priceUsd) || 0;
        const spread = refPrice > 0 ? ((poolPrice - refPrice) / refPrice) * 100 : 0;
        return { ...pool, heat, spread };
      });
  }, [poolsData]);

  // Calculate main ARBME price (WETH pair)
  const mainArbmePrice = useMemo(() => {
    return poolsData?.arbmePrice ? parseFloat(poolsData.arbmePrice) : 0;
  }, [poolsData]);

  // Fetch pools data
  const loadPools = useCallback(async () => {
    try {
      const data = await fetchPools();
      setPoolsData(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('[Traffic] Failed to load pools:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch swaps and calculate flows
  const loadSwaps = useCallback(async () => {
    try {
      const res = await fetch('/api/swaps?limit=50');
      const data = await res.json();

      if (data.swaps) {
        setSwaps(data.swaps);

        // Calculate flows from swap data
        const newFlows: FlowData = {
          usdcToRatchet: 0,
          ratchetToUsdc: 0,
          ratchetToArbme: 0,
          arbmeToRatchet: 0,
          usdcToArbme: 0,
          arbmeToUsdc: 0,
        };

        // Sum up flows (using approximate USD values)
        data.swaps.forEach((swap: SwapEvent) => {
          const tokenIn = swap.tokenIn.toLowerCase();
          const tokenOut = swap.tokenOut.toLowerCase();
          const amountIn = parseFloat(swap.formattedAmountIn || '0');

          // Approximate USD value (very rough)
          let usdValue = amountIn;
          if (swap.tokenInInfo?.symbol === 'USDC') {
            usdValue = amountIn;
          } else if (swap.tokenInInfo?.symbol === 'WETH') {
            usdValue = amountIn * 3000; // Approximate ETH price
          } else {
            usdValue = amountIn * 0.001; // Token approximation
          }

          if (tokenIn === TRACKED_TOKENS.USDC && tokenOut === TRACKED_TOKENS.RATCHET) {
            newFlows.usdcToRatchet += usdValue;
          } else if (tokenIn === TRACKED_TOKENS.RATCHET && tokenOut === TRACKED_TOKENS.USDC) {
            newFlows.ratchetToUsdc += usdValue;
          } else if (tokenIn === TRACKED_TOKENS.RATCHET && tokenOut === TRACKED_TOKENS.ARBME) {
            newFlows.ratchetToArbme += usdValue;
          } else if (tokenIn === TRACKED_TOKENS.ARBME && tokenOut === TRACKED_TOKENS.RATCHET) {
            newFlows.arbmeToRatchet += usdValue;
          } else if (tokenIn === TRACKED_TOKENS.USDC && tokenOut === TRACKED_TOKENS.ARBME) {
            newFlows.usdcToArbme += usdValue;
          } else if (tokenIn === TRACKED_TOKENS.ARBME && tokenOut === TRACKED_TOKENS.USDC) {
            newFlows.arbmeToUsdc += usdValue;
          }
        });

        setFlows(newFlows);
      }
    } catch (err) {
      console.error('[Traffic] Failed to load swaps:', err);
    } finally {
      setSwapsLoading(false);
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    loadPools();
    loadSwaps();

    // Poll for updates
    const poolsInterval = setInterval(loadPools, 30000);
    const swapsInterval = setInterval(loadSwaps, 5000);

    return () => {
      clearInterval(poolsInterval);
      clearInterval(swapsInterval);
    };
  }, [loadPools, loadSwaps]);

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back to Home" />

        <div className={styles.page}>
          <header className={styles.header}>
            <h1 className={styles.title}>Market Traffic</h1>
            <p className={styles.subtitle}>Real-time ecosystem activity</p>
            {lastUpdate && (
              <span className={styles.lastUpdate}>
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </header>

          {loading ? (
            <div className={styles.loading}>Loading market data...</div>
          ) : (
            <div className={styles.grid}>
              {/* Spread Index */}
              <SpreadIndex pools={poolsWithMetrics} mainPrice={mainArbmePrice} />

              {/* Pool Heat Map */}
              <PoolHeatMap pools={poolsWithMetrics} />

              {/* Live Swaps Feed */}
              <LiveSwapsFeed swaps={swaps} loading={swapsLoading} />
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
