/**
 * ARBME Market Making Bot - Phase 1 (Monitoring Only)
 *
 * Uses the ArbMe API to fetch all pool data and detect arbitrage opportunities
 */

import dotenv from 'dotenv';

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  API_URL: 'https://arbme-api.dylan-259.workers.dev/pools',
  MIN_SPREAD: parseFloat(process.env.MIN_SPREAD_PERCENT || '6.5'),
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL_MS || '2000'),
  TRADE_SIZE: parseFloat(process.env.TRADE_SIZE_USD || '35'),
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Pool {
  pair: string;
  pairAddress: string;
  dex: string;
  tvl: number;
  priceUsd: string;
  volume24h: number;
}

interface ApiResponse {
  arbmePrice: string;
  tokenPrices: {
    PAGE: number;
    OINC: number;
    CLANKER: number;
  };
  pools: Pool[];
  poolCount: number;
  totalTvl: number;
}

interface Opportunity {
  timestamp: string;
  buyPool: string;
  sellPool: string;
  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;
  estimatedProfit: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API FETCHING
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchPoolData(): Promise<ApiResponse | null> {
  try {
    const response = await fetch(CONFIG.API_URL, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    return await response.json() as ApiResponse;
  } catch (error) {
    console.error('❌ Failed to fetch from API:', error instanceof Error ? error.message : error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPPORTUNITY DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeOpportunities(data: ApiResponse): Opportunity[] {
  const opportunities: Opportunity[] = [];

  // Filter pools with valid prices and TVL
  const validPools = data.pools.filter(p =>
    p.priceUsd &&
    parseFloat(p.priceUsd) > 0 &&
    p.tvl > 100 // Only pools with >$100 TVL
  );

  // Compare each pair of pools
  for (let i = 0; i < validPools.length; i++) {
    for (let j = i + 1; j < validPools.length; j++) {
      const poolA = validPools[i];
      const poolB = validPools[j];

      const priceA = parseFloat(poolA.priceUsd);
      const priceB = parseFloat(poolB.priceUsd);

      const priceLow = Math.min(priceA, priceB);
      const priceHigh = Math.max(priceA, priceB);
      const spreadPercent = ((priceHigh - priceLow) / priceLow) * 100;

      if (spreadPercent >= CONFIG.MIN_SPREAD) {
        const buyPool = priceA < priceB ? poolA : poolB;
        const sellPool = priceA < priceB ? poolB : poolA;

        const buyPrice = parseFloat(buyPool.priceUsd);
        const sellPrice = parseFloat(sellPool.priceUsd);
        const profit = calculateProfit(buyPrice, sellPrice, CONFIG.TRADE_SIZE);

        opportunities.push({
          timestamp: new Date().toISOString(),
          buyPool: `${buyPool.pair} (${buyPool.dex})`,
          sellPool: `${sellPool.pair} (${sellPool.dex})`,
          buyPrice,
          sellPrice,
          spreadPercent,
          estimatedProfit: profit > 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`,
        });
      }
    }
  }

  return opportunities;
}

function calculateProfit(buyPrice: number, sellPrice: number, tradeSizeUSD: number): number {
  const arbmeAmount = tradeSizeUSD / buyPrice;
  const revenue = arbmeAmount * sellPrice;

  // Costs: 3% buy fee + 3% sell fee + gas (<$0.01)
  const costs = tradeSizeUSD * 0.03 + revenue * 0.03 + 0.01;

  return revenue - tradeSizeUSD - costs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

let opportunityCount = 0;

function displayState(data: ApiResponse, opportunities: Opportunity[]) {
  console.clear();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ARBME MARKET MAKING BOT - PHASE 1 (MONITORING)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Time: ${new Date().toLocaleString()}`);
  console.log(`  Min Spread: ${CONFIG.MIN_SPREAD}%`);
  console.log(`  Trade Size: $${CONFIG.TRADE_SIZE}`);
  console.log(`  Opportunities Found: ${opportunityCount}`);
  console.log('───────────────────────────────────────────────────────────────\n');

  // Price feeds
  console.log('📊 PRICE FEEDS (from ArbMe API):');
  console.log(`   ARBME Reference: $${parseFloat(data.arbmePrice).toExponential(4)}`);
  console.log(`   CLANKER: $${data.tokenPrices.CLANKER.toFixed(2)}`);
  console.log(`   PAGE: $${data.tokenPrices.PAGE.toFixed(6)}`);
  console.log(`   OINC: $${data.tokenPrices.OINC.toFixed(8)}`);
  console.log('');

  // Pool summary
  console.log(`💧 MONITORED POOLS: ${data.poolCount} total, $${data.totalTvl.toLocaleString(undefined, {maximumFractionDigits: 0})} TVL`);

  const validPools = data.pools.filter(p => p.priceUsd && p.tvl > 100);
  console.log(`   ${validPools.length} pools with >$100 TVL:\n`);

  validPools.forEach(pool => {
    const priceUsd = parseFloat(pool.priceUsd);
    const deviation = ((priceUsd - parseFloat(data.arbmePrice)) / parseFloat(data.arbmePrice) * 100);
    console.log(`   ${pool.pair} (${pool.dex}):`);
    console.log(`      Price: $${priceUsd.toExponential(4)} (${deviation > 0 ? '+' : ''}${deviation.toFixed(2)}% from ref)`);
    console.log(`      TVL: $${pool.tvl.toLocaleString(undefined, {maximumFractionDigits: 0})}`);
    console.log('');
  });

  // Opportunities
  if (opportunities.length > 0) {
    console.log('🚨 OPPORTUNITIES DETECTED:');
    opportunities.forEach((opp, i) => {
      console.log(`   ${i + 1}. Spread: ${opp.spreadPercent.toFixed(2)}%`);
      console.log(`      BUY:  ${opp.buyPool} @ $${opp.buyPrice.toExponential(4)}`);
      console.log(`      SELL: ${opp.sellPool} @ $${opp.sellPrice.toExponential(4)}`);
      console.log(`      Est. Profit: ${opp.estimatedProfit} (on $${CONFIG.TRADE_SIZE} trade)`);
      console.log('');
    });
  } else {
    console.log(`✅ No opportunities (all spreads < ${CONFIG.MIN_SPREAD}%)\n`);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Press Ctrl+C to stop');
  console.log('═══════════════════════════════════════════════════════════════');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════════════

async function monitor() {
  console.log('🚀 Starting ARBME Market Making Bot...');
  console.log(`📡 API: ${CONFIG.API_URL}`);
  console.log(`⏱️  Poll Interval: ${CONFIG.POLL_INTERVAL}ms`);
  console.log(`💰 Min Spread: ${CONFIG.MIN_SPREAD}%`);
  console.log('');

  setInterval(async () => {
    try {
      const data = await fetchPoolData();

      if (!data) {
        console.error('❌ Failed to fetch pool data');
        return;
      }

      const opportunities = analyzeOpportunities(data);
      opportunityCount += opportunities.length;

      displayState(data, opportunities);

      // TODO: Log opportunities to file/webhook
    } catch (error) {
      console.error('❌ Monitor error:', error instanceof Error ? error.message : error);
    }
  }, CONFIG.POLL_INTERVAL);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════════════════

process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down bot...');
  console.log(`📊 Total opportunities detected: ${opportunityCount}`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Received SIGTERM, shutting down...');
  process.exit(0);
});

monitor().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
