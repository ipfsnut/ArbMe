/**
 * Portfolio Management Configuration
 *
 * Ensures we always have liquidity to trade in any direction
 */
import { parseUnits } from 'viem';
// ═══════════════════════════════════════════════════════════════════════════════
// RESERVES - Minimum amounts to ALWAYS keep
// ═══════════════════════════════════════════════════════════════════════════════
export const MIN_RESERVES = {
    // ETH: Keep for gas + minimum buy power
    ETH: parseUnits('0.0003', 18), // ~$0.96 (gas reserve + buffer)
    // ARBME: Always keep some to sell when opportunities arise
    ARBME: parseUnits('1000000', 18), // 1M ARBME (~$0.75)
    // CLANKER: Keep small amount for buying ARBME
    CLANKER: parseUnits('0.00002', 18), // ~$0.60
    // WETH: Small reserve (we can wrap ETH if needed)
    WETH: parseUnits('0.0001', 18), // ~$0.32
};
// ═══════════════════════════════════════════════════════════════════════════════
// POSITION SIZING
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Trade up to 60% of available balance (balance - reserve)
 * This ensures we always keep 40% + reserve for future opportunities
 */
export const POSITION_SIZE_PERCENT = 0.60; // 60%
/**
 * Maximum USD value per trade (safety limit)
 */
export const MAX_TRADE_USD = 2.0; // Max $2 per trade
// ═══════════════════════════════════════════════════════════════════════════════
// PORTFOLIO REBALANCING
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Target portfolio allocation (percentages)
 * Bot will try to maintain these ratios over time
 */
export const TARGET_ALLOCATION = {
    ETH: 0.30, // 30% in ETH (buying power + gas)
    ARBME: 0.50, // 50% in ARBME (main trading asset)
    CLANKER: 0.10, // 10% in CLANKER (rotation token)
    WETH: 0.10, // 10% in WETH (rotation token)
};
/**
 * How far from target allocation before rebalancing?
 * e.g., 0.20 = rebalance if >20% off target
 */
export const REBALANCE_THRESHOLD = 0.25; // 25%
/**
 * Calculate available balance for trading
 */
export function calculateAvailableBalance(totalBalance, reserve, positionSize = POSITION_SIZE_PERCENT) {
    if (totalBalance <= reserve)
        return 0n;
    const available = totalBalance - reserve;
    const tradeable = (available * BigInt(Math.floor(positionSize * 1000))) / 1000n;
    return tradeable;
}
/**
 * Check if we have enough balance to trade
 */
export function canAffordTrade(tokenBalance, tokenReserve, amountNeeded) {
    const available = tokenBalance - tokenReserve;
    return available >= amountNeeded;
}
/**
 * Calculate portfolio allocation score
 * Returns how well-balanced the portfolio is (0 = perfect, 1 = very imbalanced)
 */
export function calculatePortfolioImbalance(ethUsd, arbmeUsd, clankerUsd, wethUsd) {
    const total = ethUsd + arbmeUsd + clankerUsd + wethUsd;
    if (total === 0)
        return 1;
    const currentAllocation = {
        ETH: ethUsd / total,
        ARBME: arbmeUsd / total,
        CLANKER: clankerUsd / total,
        WETH: wethUsd / total,
    };
    // Calculate deviation from target
    const deviations = [
        Math.abs(currentAllocation.ETH - TARGET_ALLOCATION.ETH),
        Math.abs(currentAllocation.ARBME - TARGET_ALLOCATION.ARBME),
        Math.abs(currentAllocation.CLANKER - TARGET_ALLOCATION.CLANKER),
        Math.abs(currentAllocation.WETH - TARGET_ALLOCATION.WETH),
    ];
    return deviations.reduce((sum, dev) => sum + dev, 0) / 4;
}
/**
 * Score a trade opportunity
 * Higher score = better trade (profit + rebalancing benefit)
 */
export function scoreTradeOpportunity(profitUsd, currentImbalance, imbalanceAfterTrade) {
    // Profit is primary driver
    const profitScore = profitUsd;
    // Bonus if this trade improves balance
    const rebalanceImprovement = currentImbalance - imbalanceAfterTrade;
    const rebalanceBonus = Math.max(0, rebalanceImprovement * 2); // Up to $2 bonus
    return {
        profitUsd,
        rebalanceBonus,
        totalScore: profitScore + rebalanceBonus,
    };
}
