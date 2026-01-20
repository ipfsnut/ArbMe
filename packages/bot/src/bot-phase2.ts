/**
 * ARBME Market Making Bot - Phase 2 (Execution)
 *
 * Monitors pools and executes profitable trades
 */

import dotenv from 'dotenv';
import { createPublicClient, http, parseUnits, formatUnits, type Address } from 'viem';
import { base } from 'viem/chains';
import { TradeExecutor, type TradeConfig, TOKENS } from './trade-executor';
import { getPoolState, getSwapQuote, POOLS } from './uniswap-v4';
import { ProfitCalculator, type PriceFeed, formatProfitAnalysis } from './profit-calculator';
import { createPoolKey } from './uniswap-v4-swap';
import {
  MIN_RESERVES,
  POSITION_SIZE_PERCENT,
  MAX_TRADE_USD,
  calculateAvailableBalance,
  canAffordTrade,
  calculatePortfolioImbalance,
  scoreTradeOpportunity,
} from './portfolio-config';

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  API_URL: `http://localhost:${process.env.PORT || 3000}/pools`,
  MIN_SPREAD_PERCENT: parseFloat(process.env.MIN_SPREAD_PERCENT || '6.5'),
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL_MS || '5000'), // 5s for execution mode
  MIN_ETH_RESERVE: parseUnits('0.0002', 18), // Keep 0.0002 ETH for gas
  MAX_GAS_PRICE_GWEI: 100, // Take any trade if profitable, even with high gas
  SLIPPAGE_TOLERANCE: 0.01, // 1% slippage tolerance
  DRY_RUN: process.env.DRY_RUN === 'true', // Set DRY_RUN=true to test without executing
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

interface TradeOpportunity {
  type: 'one-way';
  direction: 'buy' | 'sell';
  pool: Pool;
  tokenIn: Address;
  tokenInSymbol: string;
  tokenOut: Address;
  tokenOutSymbol: string;
  spreadPercent: number;
  estimatedProfitUsd: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

let opportunityCount = 0;
let tradesExecuted = 0;
let totalProfitUsd = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const PRIVATE_KEY = `0x${process.env.PRIVATE_KEY}` as `0x${string}`;
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY!;

const publicClient = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
});

const tradeConfig: TradeConfig = {
  privateKey: PRIVATE_KEY,
  alchemyKey: ALCHEMY_KEY,
  minEthReserve: CONFIG.MIN_ETH_RESERVE,
  maxGasPriceGwei: CONFIG.MAX_GAS_PRICE_GWEI,
  slippageTolerance: CONFIG.SLIPPAGE_TOLERANCE,
  dryRun: CONFIG.DRY_RUN,
};

const executor = new TradeExecutor(tradeConfig);

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

async function detectOpportunities(data: ApiResponse): Promise<TradeOpportunity[]> {
  const opportunities: TradeOpportunity[] = [];

  // Get current balances for ALL tokens
  const ethBalance = await executor.getEthBalance();
  const arbmeBalance = await executor.getTokenBalance(TOKENS.ARBME);
  const clankerBalance = await executor.getTokenBalance(TOKENS.CLANKER);
  const wethBalance = await executor.getTokenBalance(TOKENS.WETH);

  // Calculate AVAILABLE balances (total - reserve) with position sizing
  const availableEth = calculateAvailableBalance(ethBalance, MIN_RESERVES.ETH, POSITION_SIZE_PERCENT);
  const availableArbme = calculateAvailableBalance(arbmeBalance, MIN_RESERVES.ARBME, POSITION_SIZE_PERCENT);
  const availableClanker = calculateAvailableBalance(clankerBalance, MIN_RESERVES.CLANKER, POSITION_SIZE_PERCENT);
  const availableWeth = calculateAvailableBalance(wethBalance, MIN_RESERVES.WETH, POSITION_SIZE_PERCENT);

  // Build price feed
  const prices: PriceFeed = {
    WETH: 3200, // TODO: Get from API or oracle
    ARBME: parseFloat(data.arbmePrice),
    CLANKER: data.tokenPrices.CLANKER,
    PAGE: data.tokenPrices.PAGE,
    USDC: 1.0,
  };

  const refPrice = parseFloat(data.arbmePrice);

  // Find pools with significant price deviations
  for (const pool of data.pools) {
    if (!pool.priceUsd || pool.tvl < 100) continue;

    const poolPrice = parseFloat(pool.priceUsd);
    const deviation = ((poolPrice - refPrice) / refPrice) * 100;
    const absDeviation = Math.abs(deviation);

    if (absDeviation < CONFIG.MIN_SPREAD_PERCENT) continue;

    // Opportunity detected!
    if (deviation > 0) {
      // Pool prices ARBME higher -> SELL ARBME here
      if (availableArbme === 0n) continue; // Can't sell if we have none

      const arbmeUsd = Number(formatUnits(availableArbme, 18)) * refPrice;
      const tradeUsd = Math.min(arbmeUsd, MAX_TRADE_USD); // Cap at max trade size

      opportunities.push({
        type: 'one-way',
        direction: 'sell',
        pool,
        tokenIn: TOKENS.ARBME,
        tokenInSymbol: 'ARBME',
        tokenOut: pool.pair.includes('WETH') ? TOKENS.WETH : TOKENS.CLANKER,
        tokenOutSymbol: pool.pair.includes('WETH') ? 'WETH' : 'CLANKER',
        spreadPercent: absDeviation,
        estimatedProfitUsd: tradeUsd * (absDeviation / 100) * 0.97,
      });
    } else {
      // Pool prices ARBME lower -> BUY ARBME here
      const isWethPool = pool.pair.includes('WETH');
      const isClankerPool = pool.pair.includes('CLANKER');

      if (isWethPool && availableEth > 0n) {
        // Buy ARBME with ETH/WETH
        const ethUsd = Number(formatUnits(availableEth, 18)) * prices.WETH;
        const tradeUsd = Math.min(ethUsd, MAX_TRADE_USD);

        opportunities.push({
          type: 'one-way',
          direction: 'buy',
          pool,
          tokenIn: TOKENS.WETH,
          tokenInSymbol: 'ETH', // We'll handle wrapping if needed
          tokenOut: TOKENS.ARBME,
          tokenOutSymbol: 'ARBME',
          spreadPercent: absDeviation,
          estimatedProfitUsd: tradeUsd * (absDeviation / 100) * 0.97,
        });
      } else if (isClankerPool && availableClanker > 0n) {
        // ✅ NEW: Buy ARBME with CLANKER
        const clankerUsd = Number(formatUnits(availableClanker, 18)) * prices.CLANKER;
        const tradeUsd = Math.min(clankerUsd, MAX_TRADE_USD);

        opportunities.push({
          type: 'one-way',
          direction: 'buy',
          pool,
          tokenIn: TOKENS.CLANKER,
          tokenInSymbol: 'CLANKER',
          tokenOut: TOKENS.ARBME,
          tokenOutSymbol: 'ARBME',
          spreadPercent: absDeviation,
          estimatedProfitUsd: tradeUsd * (absDeviation / 100) * 0.97,
        });
      }
    }
  }

  return opportunities;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRADE EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

async function executeTrade(opportunity: TradeOpportunity, prices: PriceFeed): Promise<boolean> {
  console.log('\n🎯 EXECUTING OPPORTUNITY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Direction: ${opportunity.direction.toUpperCase()}`);
  console.log(`Pool: ${opportunity.pool.pair} (${opportunity.pool.dex})`);
  console.log(`Spread: ${opportunity.spreadPercent.toFixed(2)}%`);
  console.log(`Est. Profit: $${opportunity.estimatedProfitUsd.toFixed(4)}`);

  try {
    // Determine pool configuration
    let poolId: Address;
    let poolKey: any;

    if (opportunity.pool.pair.includes('ARBME / WETH')) {
      poolId = POOLS.ARBME_WETH;
      poolKey = createPoolKey(
        TOKENS.ARBME,
        TOKENS.WETH,
        30000, // 3% fee
        200,   // tick spacing
      );
    } else if (opportunity.pool.pair.includes('CLANKER / ARBME')) {
      poolId = POOLS.CLANKER_ARBME;
      poolKey = createPoolKey(
        TOKENS.ARBME,
        '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb' as Address, // CLANKER
        30000, // 3% fee
        200,   // tick spacing
      );
    } else {
      console.log('❌ Unknown pool, skipping');
      return false;
    }

    // Determine trade amount
    let amountIn: bigint;
    if (opportunity.direction === 'sell') {
      // Sell all ARBME
      amountIn = await executor.getTokenBalance(TOKENS.ARBME);
    } else {
      // Buy with available ETH (keep reserve)
      const ethBalance = await executor.getEthBalance();
      const availableEth = ethBalance - CONFIG.MIN_ETH_RESERVE;
      amountIn = availableEth;
    }

    if (amountIn <= 0n) {
      console.log('❌ Insufficient balance');
      return false;
    }

    console.log(`Amount in: ${formatUnits(amountIn, 18)} ${opportunity.tokenInSymbol}`);

    // Get quote
    console.log('\n📊 Getting swap quote...');
    const quote = await getSwapQuote(
      publicClient as any,
      poolId,
      amountIn,
      opportunity.tokenIn,
      opportunity.tokenOut,
      18, // decimals in
      18, // decimals out
      CONFIG.SLIPPAGE_TOLERANCE,
      3, // fee percent
    );

    console.log(`Expected out: ${formatUnits(quote.expectedAmountOut, 18)} ${opportunity.tokenOutSymbol}`);
    console.log(`Min out: ${formatUnits(quote.minAmountOut, 18)} ${opportunity.tokenOutSymbol}`);
    console.log(`Price impact: ${quote.priceImpact.toFixed(4)}%`);

    // Calculate profit
    const calculator = new ProfitCalculator(prices);
    const { gasPrice } = await executor.getCurrentGasPrice();
    const estimatedGas = 200000n;
    const gasCost = gasPrice * estimatedGas;

    const profitAnalysis = calculator.calculateTradeProfit(
      opportunity.tokenInSymbol,
      opportunity.tokenOutSymbol,
      amountIn,
      quote.expectedAmountOut,
      quote.minAmountOut,
      gasCost,
      3, // fee percent
    );

    console.log('\n💰 PROFIT ANALYSIS:');
    console.log(formatProfitAnalysis(profitAnalysis));

    if (!profitAnalysis.isProfitable) {
      console.log('\n❌ Trade not profitable after costs, skipping');
      return false;
    }

    // Execute trade
    console.log('\n🚀 Executing trade...');
    const result = await executor.executeTrade(
      opportunity.tokenIn,
      opportunity.tokenOut,
      amountIn,
      poolKey, // Pass pool key for V4 execution
    );

    if (result.success) {
      console.log(`\n✅ TRADE SUCCESSFUL!`);
      console.log(`TX Hash: ${result.txHash}`);
      console.log(`Net Profit: $${result.netProfit?.toFixed(4)}`);

      tradesExecuted++;
      totalProfitUsd += result.netProfit || 0;

      return true;
    } else {
      console.log(`\n❌ Trade failed: ${result.error}`);
      return false;
    }
  } catch (error) {
    console.error('\n❌ Error executing trade:', error instanceof Error ? error.message : error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

function displayState(data: ApiResponse, opportunities: TradeOpportunity[]) {
  console.clear();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ARBME MARKET MAKING BOT - PHASE 2 (EXECUTION)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Time: ${new Date().toLocaleString()}`);
  console.log(`  Mode: ${CONFIG.DRY_RUN ? '🧪 DRY RUN' : '⚡ LIVE TRADING'}`);
  console.log(`  Min Spread: ${CONFIG.MIN_SPREAD_PERCENT}%`);
  console.log(`  Trades Executed: ${tradesExecuted}`);
  console.log(`  Total Profit: $${totalProfitUsd.toFixed(4)}`);
  console.log('───────────────────────────────────────────────────────────────\n');

  // Price feeds
  console.log('📊 PRICE FEEDS:');
  console.log(`   ARBME Reference: $${parseFloat(data.arbmePrice).toExponential(4)}`);
  console.log(`   CLANKER: $${data.tokenPrices.CLANKER.toFixed(2)}`);
  console.log(`   PAGE: $${data.tokenPrices.PAGE.toFixed(6)}`);
  console.log('');

  // Pool summary
  const validPools = data.pools.filter(p => p.priceUsd && p.tvl > 100);
  console.log(`💧 MONITORED POOLS: ${validPools.length} with >$100 TVL\n`);

  validPools.forEach(pool => {
    const priceUsd = parseFloat(pool.priceUsd);
    const deviation = ((priceUsd - parseFloat(data.arbmePrice)) / parseFloat(data.arbmePrice) * 100);
    console.log(`   ${pool.pair}:`);
    console.log(`      Price: $${priceUsd.toExponential(4)} (${deviation > 0 ? '+' : ''}${deviation.toFixed(2)}%)`);
    console.log(`      TVL: $${pool.tvl.toLocaleString()}`);
  });

  console.log('');

  // Opportunities
  if (opportunities.length > 0) {
    console.log(`🚨 OPPORTUNITIES DETECTED: ${opportunities.length}\n`);
    opportunities.forEach((opp, i) => {
      console.log(`   ${i + 1}. ${opp.direction.toUpperCase()} on ${opp.pool.pair}`);
      console.log(`      Spread: ${opp.spreadPercent.toFixed(2)}%`);
      console.log(`      Est. Profit: $${opp.estimatedProfitUsd.toFixed(4)}`);
      console.log('');
    });
  } else {
    console.log(`✅ No opportunities (all spreads < ${CONFIG.MIN_SPREAD_PERCENT}%)\n`);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Press Ctrl+C to stop');
  console.log('═══════════════════════════════════════════════════════════════');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════════════

async function monitor() {
  console.log('🚀 Starting ARBME Market Making Bot - Phase 2');
  console.log(`📡 API: ${CONFIG.API_URL}`);
  console.log(`⏱️  Poll Interval: ${CONFIG.POLL_INTERVAL}ms`);
  console.log(`💰 Min Spread: ${CONFIG.MIN_SPREAD_PERCENT}%`);
  console.log(`🔒 Min ETH Reserve: ${formatUnits(CONFIG.MIN_ETH_RESERVE, 18)} ETH`);
  console.log(`${CONFIG.DRY_RUN ? '🧪 DRY RUN MODE - No real trades' : '⚡ LIVE MODE - Real trades will execute'}`);
  console.log('');

  setInterval(async () => {
    try {
      const data = await fetchPoolData();

      if (!data) {
        console.error('❌ Failed to fetch pool data');
        return;
      }

      const opportunities = await detectOpportunities(data);
      opportunityCount += opportunities.length;

      displayState(data, opportunities);

      // Execute first opportunity if found
      if (opportunities.length > 0) {
        const prices: PriceFeed = {
          WETH: 3200,
          ARBME: parseFloat(data.arbmePrice),
          CLANKER: data.tokenPrices.CLANKER,
          PAGE: data.tokenPrices.PAGE,
          USDC: 1.0,
        };

        await executeTrade(opportunities[0], prices);
      }
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
  console.log(`💰 Trades executed: ${tradesExecuted}`);
  console.log(`💵 Total profit: $${totalProfitUsd.toFixed(4)}`);
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
