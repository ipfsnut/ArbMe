/**
 * Profit Calculator
 *
 * Calculates actual profit in USD for arbitrage trades
 * Accounts for gas costs, swap fees, slippage, and price impact
 */
import { formatUnits } from 'viem';
// ═══════════════════════════════════════════════════════════════════════════════
// PRICE FEED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
export function getTokenPrice(symbol, prices) {
    const upperSymbol = symbol.toUpperCase();
    switch (upperSymbol) {
        case 'WETH':
        case 'ETH':
            return prices.WETH;
        case 'ARBME':
            return prices.ARBME;
        case 'CLANKER':
            return prices.CLANKER;
        case 'PAGE':
            return prices.PAGE;
        case 'USDC':
            return prices.USDC;
        default:
            throw new Error(`Unknown token: ${symbol}`);
    }
}
export function getTokenDecimals(symbol) {
    const upperSymbol = symbol.toUpperCase();
    switch (upperSymbol) {
        case 'USDC':
            return 6;
        case 'WETH':
        case 'ETH':
        case 'ARBME':
        case 'CLANKER':
        case 'PAGE':
            return 18;
        default:
            return 18; // Default to 18
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// PROFIT CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════
export class ProfitCalculator {
    prices;
    constructor(prices) {
        this.prices = prices;
    }
    /**
     * Calculate profit for a single trade
     */
    calculateTradeProfit(tokenInSymbol, tokenOutSymbol, amountIn, expectedAmountOut, minAmountOut, gasCostWei, swapFeePercent) {
        const decimalsIn = getTokenDecimals(tokenInSymbol);
        const decimalsOut = getTokenDecimals(tokenOutSymbol);
        const priceIn = getTokenPrice(tokenInSymbol, this.prices);
        const priceOut = getTokenPrice(tokenOutSymbol, this.prices);
        const ethPrice = this.prices.WETH;
        // Calculate USD values
        const amountInNum = Number(formatUnits(amountIn, decimalsIn));
        const amountInUsd = amountInNum * priceIn;
        const expectedAmountOutNum = Number(formatUnits(expectedAmountOut, decimalsOut));
        const expectedAmountOutUsd = expectedAmountOutNum * priceOut;
        const minAmountOutNum = Number(formatUnits(minAmountOut, decimalsOut));
        const minAmountOutUsd = minAmountOutNum * priceOut;
        // Calculate costs
        const gasCostEth = Number(formatUnits(gasCostWei, 18));
        const gasCostUsd = gasCostEth * ethPrice;
        const swapFeeUsd = amountInUsd * (swapFeePercent / 100);
        const slippageUsd = expectedAmountOutUsd - minAmountOutUsd;
        const totalCostsUsd = gasCostUsd + swapFeeUsd;
        // Calculate profit
        // We use minAmountOut (worst case) for profit calculation
        const grossProfitUsd = minAmountOutUsd - amountInUsd;
        const netProfitUsd = grossProfitUsd - totalCostsUsd;
        const netProfitPercent = (netProfitUsd / amountInUsd) * 100;
        // Build breakdown
        const breakdown = [
            `Input: ${amountInNum.toFixed(6)} ${tokenInSymbol} = $${amountInUsd.toFixed(4)}`,
            `Expected: ${expectedAmountOutNum.toFixed(6)} ${tokenOutSymbol} = $${expectedAmountOutUsd.toFixed(4)}`,
            `Min (after slippage): ${minAmountOutNum.toFixed(6)} ${tokenOutSymbol} = $${minAmountOutUsd.toFixed(4)}`,
            ``,
            `Costs:`,
            `  - Gas: $${gasCostUsd.toFixed(4)}`,
            `  - Swap Fee (${swapFeePercent}%): $${swapFeeUsd.toFixed(4)}`,
            `  - Total Costs: $${totalCostsUsd.toFixed(4)}`,
            ``,
            `Profit:`,
            `  - Gross: $${grossProfitUsd.toFixed(4)}`,
            `  - Net: $${netProfitUsd.toFixed(4)} (${netProfitPercent.toFixed(2)}%)`,
        ];
        return {
            tokenInSymbol,
            tokenOutSymbol,
            amountIn,
            amountInUsd,
            expectedAmountOut,
            expectedAmountOutUsd,
            minAmountOut,
            minAmountOutUsd,
            costs: {
                gasCostWei,
                gasCostUsd,
                swapFeePercent,
                swapFeeUsd,
                slippageUsd,
                totalCostsUsd,
            },
            grossProfitUsd,
            netProfitUsd,
            netProfitPercent,
            isProfitable: netProfitUsd > 0,
            breakdown,
        };
    }
    /**
     * Calculate profit for a two-leg arbitrage (buy then sell)
     */
    calculateArbitrageProfit(
    // First leg: Buy ARBME
    buyWithSymbol, // WETH or CLANKER
    buyAmountIn, buyExpectedOut, buyMinOut, buyGasCost, buyFeePercent, 
    // Second leg: Sell ARBME
    sellForSymbol, // WETH or CLANKER
    sellExpectedOut, sellMinOut, sellGasCost, sellFeePercent) {
        // Calculate first leg
        const leg1 = this.calculateTradeProfit(buyWithSymbol, 'ARBME', buyAmountIn, buyExpectedOut, buyMinOut, buyGasCost, buyFeePercent);
        // For second leg, input is the output of first leg
        const leg2 = this.calculateTradeProfit('ARBME', sellForSymbol, leg1.minAmountOut, // Use worst-case from leg 1
        sellExpectedOut, sellMinOut, sellGasCost, sellFeePercent);
        // Combined analysis
        const totalGasCostUsd = leg1.costs.gasCostUsd + leg2.costs.gasCostUsd;
        const totalSwapFeeUsd = leg1.costs.swapFeeUsd + leg2.costs.swapFeeUsd;
        const totalCostsUsd = totalGasCostUsd + totalSwapFeeUsd;
        const grossProfitUsd = leg2.minAmountOutUsd - leg1.amountInUsd;
        const netProfitUsd = grossProfitUsd - totalCostsUsd;
        const netProfitPercent = (netProfitUsd / leg1.amountInUsd) * 100;
        const breakdown = [
            `=== TWO-LEG ARBITRAGE ===`,
            ``,
            `Leg 1: Buy ARBME with ${buyWithSymbol}`,
            ...leg1.breakdown.map(line => `  ${line}`),
            ``,
            `Leg 2: Sell ARBME for ${sellForSymbol}`,
            ...leg2.breakdown.map(line => `  ${line}`),
            ``,
            `=== TOTAL ===`,
            `Start: ${formatUnits(buyAmountIn, getTokenDecimals(buyWithSymbol))} ${buyWithSymbol} = $${leg1.amountInUsd.toFixed(4)}`,
            `End: ${formatUnits(leg2.minAmountOut, getTokenDecimals(sellForSymbol))} ${sellForSymbol} = $${leg2.minAmountOutUsd.toFixed(4)}`,
            ``,
            `Total Costs: $${totalCostsUsd.toFixed(4)}`,
            `  - Gas (both legs): $${totalGasCostUsd.toFixed(4)}`,
            `  - Swap Fees (both legs): $${totalSwapFeeUsd.toFixed(4)}`,
            ``,
            `Net Profit: $${netProfitUsd.toFixed(4)} (${netProfitPercent.toFixed(2)}%)`,
        ];
        return {
            tokenInSymbol: buyWithSymbol,
            tokenOutSymbol: sellForSymbol,
            amountIn: buyAmountIn,
            amountInUsd: leg1.amountInUsd,
            expectedAmountOut: leg2.expectedAmountOut,
            expectedAmountOutUsd: leg2.expectedAmountOutUsd,
            minAmountOut: leg2.minAmountOut,
            minAmountOutUsd: leg2.minAmountOutUsd,
            costs: {
                gasCostWei: buyGasCost + sellGasCost,
                gasCostUsd: totalGasCostUsd,
                swapFeePercent: (buyFeePercent + sellFeePercent) / 2,
                swapFeeUsd: totalSwapFeeUsd,
                slippageUsd: leg1.costs.slippageUsd + leg2.costs.slippageUsd,
                totalCostsUsd,
            },
            grossProfitUsd,
            netProfitUsd,
            netProfitPercent,
            isProfitable: netProfitUsd > 0,
            breakdown,
        };
    }
    /**
     * Update prices (call this when fetching new price data)
     */
    updatePrices(newPrices) {
        this.prices = { ...this.prices, ...newPrices };
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Calculate minimum profitable amount needed given costs
 */
export function calculateMinProfitableAmount(gasCostUsd, swapFeePercent, minProfitUsd, spreadPercent) {
    // We need: (amountIn * spread%) - (amountIn * swapFee%) - gasCost >= minProfit
    // Solving for amountIn:
    // amountIn * (spread% - swapFee%) >= minProfit + gasCost
    // amountIn >= (minProfit + gasCost) / (spread% - swapFee%)
    const netSpreadPercent = spreadPercent - swapFeePercent;
    if (netSpreadPercent <= 0) {
        return Infinity; // Not profitable at any amount
    }
    const minAmount = (minProfitUsd + gasCostUsd) / (netSpreadPercent / 100);
    return minAmount;
}
/**
 * Format profit analysis for console display
 */
export function formatProfitAnalysis(analysis) {
    return analysis.breakdown.join('\n');
}
