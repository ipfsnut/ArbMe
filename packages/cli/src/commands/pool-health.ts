/**
 * chaos pool-health <token>
 *
 * Scans a Base token's pools via GeckoTerminal and generates a health report
 * with spread analysis, liquidity distribution, fee breakdown, routing assessment,
 * and actionable recommendations.
 */

import { writeFileSync } from 'node:fs';
import { getTokenMetadata } from '@arbme/core-lib';
import { fetchPoolsForToken, type GeckoPool } from '../lib/gecko.js';
import {
  type HealthAnalysis,
  generateMarkdownReport,
  generateJsonReport,
  generateEmptyReport,
} from '../lib/report.js';

interface PoolHealthOptions {
  alchemyKey?: string;
  minTvl: string;
  output?: string;
  json?: boolean;
  verbose?: boolean;
}

const WETH_SYMBOLS = ['weth', 'eth'];
const USDC_SYMBOLS = ['usdc', 'usd coin'];

// ═══════════════════════════════════════════════════════════════════════════════
// Analysis helpers
// ═══════════════════════════════════════════════════════════════════════════════

function computeSpread(pools: GeckoPool[]): HealthAnalysis['spread'] {
  const prices = pools.map((p) => p.targetTokenPriceUSD).filter((p) => p > 0).sort((a, b) => a - b);

  if (prices.length === 0) {
    return { min: 0, max: 0, median: 0, spreadPct: 0 };
  }

  const min = prices[0];
  const max = prices[prices.length - 1];
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];
  const spreadPct = median > 0 ? ((max - min) / median) * 100 : 0;

  return { min, max, median, spreadPct };
}

function computeLiquidity(
  pools: GeckoPool[],
  totalTvl: number,
): HealthAnalysis['liquidity'] {
  if (pools.length === 0 || totalTvl === 0) {
    return { topPoolPct: 0, topPoolName: 'N/A' };
  }
  const top = pools[0]; // already sorted by TVL desc
  return {
    topPoolPct: ((top.tvl || 0) / totalTvl) * 100,
    topPoolName: top.name || top.address.slice(0, 10),
  };
}

function computeFeeTiers(pools: GeckoPool[]): Record<string, number> {
  const tiers: Record<string, number> = {};
  for (const p of pools) {
    const key = p.fee || 'Unknown';
    tiers[key] = (tiers[key] || 0) + 1;
  }
  return tiers;
}

function computeDexBreakdown(
  pools: GeckoPool[],
): Record<string, { count: number; tvl: number }> {
  const breakdown: Record<string, { count: number; tvl: number }> = {};
  for (const p of pools) {
    const key = p.dex ? `${p.dex} (${p.version})` : p.version;
    if (!breakdown[key]) breakdown[key] = { count: 0, tvl: 0 };
    breakdown[key].count++;
    breakdown[key].tvl += p.tvl || 0;
  }
  return breakdown;
}

function computeRouting(
  pools: GeckoPool[],
  tokenAddress: string,
): HealthAnalysis['routing'] {
  const normalizedToken = tokenAddress.toLowerCase();
  const quoteTokens = new Set<string>();
  let hasWethPair = false;
  let hasUsdcPair = false;
  let bestEntryPool = '';
  let bestEntryTvl = 0;

  for (const p of pools) {
    // Determine which side is the "quote" token
    const quoteSymbol =
      p.baseTokenAddress.toLowerCase() === normalizedToken
        ? p.quoteTokenSymbol
        : p.baseTokenSymbol;

    if (quoteSymbol) {
      quoteTokens.add(quoteSymbol);
      const lower = quoteSymbol.toLowerCase();
      if (WETH_SYMBOLS.includes(lower)) hasWethPair = true;
      if (USDC_SYMBOLS.includes(lower)) hasUsdcPair = true;
    }

    // Track best entry pool (highest TVL with WETH or USDC)
    const isStable =
      quoteSymbol &&
      (WETH_SYMBOLS.includes(quoteSymbol.toLowerCase()) ||
        USDC_SYMBOLS.includes(quoteSymbol.toLowerCase()));
    if (isStable && (p.tvl || 0) > bestEntryTvl) {
      bestEntryTvl = p.tvl || 0;
      bestEntryPool = p.name || p.address.slice(0, 10);
    }
  }

  return {
    hasWethPair,
    hasUsdcPair,
    uniqueQuoteTokens: Array.from(quoteTokens),
    bestEntryPool: bestEntryPool || (pools[0]?.name ?? 'N/A'),
  };
}

function computeHealthScore(
  totalTvl: number,
  totalPools: number,
  spread: HealthAnalysis['spread'],
  routing: HealthAnalysis['routing'],
  liquidity: HealthAnalysis['liquidity'],
): number {
  let score = 0;

  // TVL score (0-30 points)
  if (totalTvl >= 1_000_000) score += 30;
  else if (totalTvl >= 100_000) score += 25;
  else if (totalTvl >= 10_000) score += 15;
  else if (totalTvl >= 1_000) score += 8;
  else if (totalTvl > 0) score += 3;

  // Pool count (0-15 points)
  if (totalPools >= 10) score += 15;
  else if (totalPools >= 5) score += 12;
  else if (totalPools >= 3) score += 8;
  else if (totalPools >= 1) score += 4;

  // Spread tightness (0-20 points)
  if (spread.spreadPct === 0 && totalPools <= 1) score += 10; // only 1 pool, N/A
  else if (spread.spreadPct < 1) score += 20;
  else if (spread.spreadPct < 3) score += 15;
  else if (spread.spreadPct < 5) score += 10;
  else if (spread.spreadPct < 10) score += 5;

  // Routing (0-20 points)
  if (routing.hasWethPair) score += 10;
  if (routing.hasUsdcPair) score += 5;
  if (routing.uniqueQuoteTokens.length >= 3) score += 5;
  else if (routing.uniqueQuoteTokens.length >= 2) score += 3;

  // Concentration risk (0-15 points) — lower is better
  if (liquidity.topPoolPct < 50) score += 15;
  else if (liquidity.topPoolPct < 70) score += 10;
  else if (liquidity.topPoolPct < 90) score += 5;

  return Math.min(100, score);
}

function generateRecommendations(analysis: HealthAnalysis): string[] {
  const recs: string[] = [];
  const { totalTvl, totalPools, spread, routing, liquidity } = analysis;

  if (totalPools === 0) {
    return ['No pools found. Consider creating a pool on Uniswap V4 or Aerodrome.'];
  }

  if (!routing.hasWethPair) {
    recs.push(
      'Create a WETH pair — this is the primary on-ramp for most traders on Base.',
    );
  }

  if (!routing.hasUsdcPair) {
    recs.push(
      'Consider adding a USDC pair for stablecoin access and to improve aggregator routing.',
    );
  }

  if (totalTvl < 10_000) {
    recs.push(
      `Total TVL is low (${fmtUsd(totalTvl)}). Adding liquidity would improve price stability and attract more volume.`,
    );
  }

  if (spread.spreadPct > 5) {
    recs.push(
      `Price spread is ${spread.spreadPct.toFixed(1)}% across pools — indicates stale liquidity or mismatched prices. Consider rebalancing or removing low-liquidity pools.`,
    );
  } else if (spread.spreadPct > 2) {
    recs.push(
      `Moderate spread of ${spread.spreadPct.toFixed(1)}%. Monitor for arbitrage opportunities.`,
    );
  }

  if (liquidity.topPoolPct > 80) {
    recs.push(
      `${liquidity.topPoolPct.toFixed(0)}% of TVL is concentrated in one pool. Diversifying liquidity across pools reduces single-point-of-failure risk.`,
    );
  }

  if (routing.uniqueQuoteTokens.length < 2) {
    recs.push(
      'Only 1 quote token paired. Adding more pairs (WETH, USDC) improves aggregator discoverability.',
    );
  }

  if (totalPools < 3) {
    recs.push(
      'Few pools detected. Deploying pools across multiple DEXes (Uniswap, Aerodrome) broadens market access.',
    );
  }

  return recs.slice(0, 5);
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Command handler
// ═══════════════════════════════════════════════════════════════════════════════

export async function poolHealth(
  token: string,
  options: PoolHealthOptions,
): Promise<void> {
  const verbose = options.verbose ?? false;
  const minTvl = parseFloat(options.minTvl) || 0;
  const alchemyKey = options.alchemyKey || process.env.ALCHEMY_KEY;

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
    console.error('Error: Invalid token address. Expected 0x... (40 hex chars)');
    process.exit(1);
  }

  console.error(`Scanning pools for ${token}...`);

  // Step 1: Token metadata
  if (verbose) console.error('  Fetching token metadata...');
  const meta = await getTokenMetadata(token, alchemyKey);
  console.error(`  Token: ${meta.symbol} (${meta.decimals} decimals)`);

  // Step 2: Fetch pools
  if (verbose) console.error('  Fetching pools from GeckoTerminal...');
  const result = await fetchPoolsForToken(token, minTvl, verbose);
  console.error(`  Found ${result.totalPools} pools (TVL: ${fmtUsd(result.totalTvl)})`);

  // Edge case: no pools
  if (result.pools.length === 0) {
    const report = options.json
      ? JSON.stringify({ token, symbol: meta.symbol, pools: [], healthScore: 0, message: 'No pools found' }, null, 2)
      : generateEmptyReport(token, meta.symbol);

    const outPath = options.output || `${meta.symbol}-pool-health.${options.json ? 'json' : 'md'}`;
    writeFileSync(outPath, report);
    console.error(`  Report written to ${outPath}`);

    if (options.json) console.log(report);
    return;
  }

  // Step 3: Derive price from top pool (use target token price, not base)
  const topPrice = result.pools[0].targetTokenPriceUSD;

  // Step 4: Analyze
  const totalVolume24h = result.pools.reduce((sum, p) => sum + p.volume24h, 0);
  const spread = computeSpread(result.pools);
  const liquidity = computeLiquidity(result.pools, result.totalTvl);
  const feeTiers = computeFeeTiers(result.pools);
  const dexBreakdown = computeDexBreakdown(result.pools);
  const routing = computeRouting(result.pools, token);
  const healthScore = computeHealthScore(
    result.totalTvl,
    result.totalPools,
    spread,
    routing,
    liquidity,
  );

  const analysis: HealthAnalysis = {
    token: {
      address: token,
      symbol: meta.symbol,
      decimals: meta.decimals,
      priceUSD: topPrice,
    },
    pools: result.pools,
    totalPools: result.totalPools,
    totalTvl: result.totalTvl,
    totalVolume24h,
    spread,
    liquidity,
    feeTiers,
    dexBreakdown,
    routing,
    healthScore,
    recommendations: [],
    timestamp: result.timestamp,
  };

  analysis.recommendations = generateRecommendations(analysis);

  // Step 5: Generate report
  const report = options.json
    ? generateJsonReport(analysis)
    : generateMarkdownReport(analysis);

  const outPath =
    options.output ||
    `${meta.symbol}-pool-health.${options.json ? 'json' : 'md'}`;

  writeFileSync(outPath, report);
  console.error(`  Health Score: ${healthScore}/100`);
  console.error(`  Report written to ${outPath}`);

  if (options.json) {
    console.log(report);
  }
}
