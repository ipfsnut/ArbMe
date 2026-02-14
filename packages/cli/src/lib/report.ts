/**
 * Markdown & JSON report generator for pool health checks
 */

import type { GeckoPool } from './gecko.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface HealthAnalysis {
  token: {
    address: string;
    symbol: string;
    decimals: number;
    priceUSD: number;
  };
  pools: GeckoPool[];
  totalPools: number;
  totalTvl: number;
  totalVolume24h: number;
  spread: {
    min: number;
    max: number;
    median: number;
    spreadPct: number;
  };
  liquidity: {
    topPoolPct: number;
    topPoolName: string;
  };
  feeTiers: Record<string, number>; // fee label -> count
  dexBreakdown: Record<string, { count: number; tvl: number }>; // dex/version -> stats
  routing: {
    hasWethPair: boolean;
    hasUsdcPair: boolean;
    uniqueQuoteTokens: string[];
    bestEntryPool: string;
  };
  healthScore: number;
  recommendations: string[];
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Markdown Report
// ═══════════════════════════════════════════════════════════════════════════════

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.000001) return `$${n.toExponential(4)}`;
  if (n < 0.01) return `$${n.toFixed(8)}`;
  if (n < 1) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function healthEmoji(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Poor';
  return 'Critical';
}

export function generateMarkdownReport(analysis: HealthAnalysis): string {
  const { token, pools, spread, liquidity, feeTiers, dexBreakdown, routing, healthScore, recommendations } = analysis;
  const lines: string[] = [];

  // Header
  lines.push(`# Pool Health Report: ${token.symbol}`);
  lines.push('');
  lines.push(`**Token**: \`${token.address}\`  `);
  lines.push(`**Price**: ${fmtPrice(token.priceUSD)}  `);
  lines.push(`**Report Date**: ${new Date(analysis.timestamp).toUTCString()}  `);
  lines.push(`**Health Score**: **${healthScore}/100** (${healthEmoji(healthScore)})  `);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Pools | ${analysis.totalPools} |`);
  lines.push(`| Total TVL | ${fmtUsd(analysis.totalTvl)} |`);
  lines.push(`| 24h Volume | ${fmtUsd(analysis.totalVolume24h)} |`);
  lines.push(`| Price Spread | ${spread.spreadPct.toFixed(2)}% |`);
  lines.push(`| Top Pool Concentration | ${liquidity.topPoolPct.toFixed(1)}% |`);
  lines.push(`| WETH Pair | ${routing.hasWethPair ? 'Yes' : 'No'} |`);
  lines.push(`| USDC Pair | ${routing.hasUsdcPair ? 'Yes' : 'No'} |`);
  lines.push(`| Unique Quote Tokens | ${routing.uniqueQuoteTokens.length} |`);
  lines.push('');

  // Pool breakdown
  if (pools.length > 0) {
    lines.push('## Pool Breakdown');
    lines.push('');
    lines.push('| # | Pool | DEX | Ver | TVL | 24h Vol | Price | Fee |');
    lines.push('|---|------|-----|-----|-----|---------|-------|-----|');
    pools.forEach((p, i) => {
      lines.push(
        `| ${i + 1} | ${p.name || p.address.slice(0, 10)} | ${p.dex || '-'} | ${p.version} | ${fmtUsd(p.tvl || 0)} | ${fmtUsd(p.volume24h)} | ${fmtPrice(p.priceUSD)} | ${p.fee || '-'} |`,
      );
    });
    lines.push('');
  }

  // Spread analysis
  lines.push('## Spread Analysis');
  lines.push('');
  if (pools.length < 2) {
    lines.push('Insufficient pools for spread analysis (need at least 2 pools with prices).');
  } else {
    lines.push(`- **Min Price**: ${fmtPrice(spread.min)}`);
    lines.push(`- **Max Price**: ${fmtPrice(spread.max)}`);
    lines.push(`- **Median Price**: ${fmtPrice(spread.median)}`);
    lines.push(`- **Spread**: ${spread.spreadPct.toFixed(2)}%`);
    lines.push('');
    if (spread.spreadPct > 5) {
      lines.push('> **Warning**: Spread exceeds 5% — significant arbitrage opportunity or stale pools detected.');
    } else if (spread.spreadPct > 2) {
      lines.push('> **Note**: Moderate spread — some arbitrage opportunity may exist.');
    } else {
      lines.push('> Spread is tight — prices are well-aligned across pools.');
    }
  }
  lines.push('');

  // Liquidity distribution
  lines.push('## Liquidity Distribution');
  lines.push('');
  lines.push('| DEX / Version | Pools | TVL | Share |');
  lines.push('|---------------|-------|-----|-------|');
  for (const [key, stats] of Object.entries(dexBreakdown)) {
    const share = analysis.totalTvl > 0 ? (stats.tvl / analysis.totalTvl * 100).toFixed(1) : '0';
    lines.push(`| ${key} | ${stats.count} | ${fmtUsd(stats.tvl)} | ${share}% |`);
  }
  lines.push('');
  if (liquidity.topPoolPct > 80) {
    lines.push(`> **Warning**: ${liquidity.topPoolPct.toFixed(0)}% of TVL is in a single pool (${liquidity.topPoolName}). High concentration risk.`);
  }
  lines.push('');

  // Fee structure
  lines.push('## Fee Structure');
  lines.push('');
  lines.push('| Fee Tier | Pools |');
  lines.push('|----------|-------|');
  for (const [fee, count] of Object.entries(feeTiers)) {
    lines.push(`| ${fee} | ${count} |`);
  }
  lines.push('');

  // Routing assessment
  lines.push('## Routing Assessment');
  lines.push('');
  lines.push(`- **WETH pair**: ${routing.hasWethPair ? 'Available' : 'Missing — limits on-ramp from ETH'}`);
  lines.push(`- **USDC pair**: ${routing.hasUsdcPair ? 'Available' : 'Missing — limits stablecoin access'}`);
  lines.push(`- **Best entry pool**: ${routing.bestEntryPool || 'N/A'}`);
  lines.push(`- **Quote tokens**: ${routing.uniqueQuoteTokens.join(', ') || 'None'}`);
  lines.push('');

  // Recommendations
  lines.push('## Recommendations');
  lines.push('');
  if (recommendations.length === 0) {
    lines.push('No specific recommendations — pool health looks solid.');
  } else {
    recommendations.forEach((rec, i) => {
      lines.push(`${i + 1}. ${rec}`);
    });
  }
  lines.push('');

  // Footer
  lines.push('---');
  lines.push(`*Generated by ChaosTheory (agent 0x3d9d) via \`chaos pool-health\`*`);
  lines.push('');

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSON Report
// ═══════════════════════════════════════════════════════════════════════════════

export function generateJsonReport(analysis: HealthAnalysis): string {
  return JSON.stringify(analysis, null, 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Empty report (0 pools)
// ═══════════════════════════════════════════════════════════════════════════════

export function generateEmptyReport(tokenAddress: string, symbol: string): string {
  const lines: string[] = [];
  lines.push(`# Pool Health Report: ${symbol}`);
  lines.push('');
  lines.push(`**Token**: \`${tokenAddress}\`  `);
  lines.push(`**Report Date**: ${new Date().toUTCString()}  `);
  lines.push(`**Health Score**: **0/100** (Critical)  `);
  lines.push('');
  lines.push('## Result');
  lines.push('');
  lines.push('No pools found on GeckoTerminal for this token on Base.');
  lines.push('');
  lines.push('This could mean:');
  lines.push('- The token has not been listed in any DEX pool yet');
  lines.push('- The token address is incorrect');
  lines.push('- Pools exist but have zero liquidity');
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  lines.push('1. Verify the token contract address is correct');
  lines.push('2. Check if the token has been deployed on Base');
  lines.push('3. Consider creating a pool on Uniswap V4 or Aerodrome');
  lines.push('');
  lines.push('---');
  lines.push(`*Generated by ChaosTheory (agent 0x3d9d) via \`chaos pool-health\`*`);
  lines.push('');
  return lines.join('\n');
}
