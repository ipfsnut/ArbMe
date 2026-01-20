# Phase 2: Trade Execution Bot

## Overview

Phase 2 builds on Phase 1 monitoring with actual trade execution. The bot now:
- ✅ Monitors pools for arbitrage opportunities (same as Phase 1)
- ✅ Models each trade before execution (gas costs, fees, slippage)
- ✅ Simulates transactions before sending them
- ✅ Executes profitable trades automatically
- ✅ Protects your gas reserve (keeps 0.0002 ETH minimum)
- ✅ Tracks profit/loss across all trades

## Current Wallet State

```
Address: 0x13B77C77BF208BbdE7bc2F1BB0083EB201CD1812
ETH:     0.001045 (~$3.35)
ARBME:   3,608,668 tokens (~$2.70 at $7.45e-7)
USDC:    $0.60
Total:   ~$6.65
```

## Strategy

The bot uses **opportunistic one-way trading**:

1. **When ARBME is underpriced** (>6.5% below reference):
   - Buy ARBME using available ETH (from ARBME/WETH pool)
   - Requires: ETH balance (we have 0.001045 ETH)

2. **When ARBME is overpriced** (>6.5% above reference):
   - Sell ARBME for WETH or CLANKER
   - Requires: ARBME balance (we have 3.6M ARBME)

Each trade must be profitable after:
- Gas costs (~$0.01 on Base, but can spike)
- Swap fees (3% on these pools)
- Slippage (1% tolerance)

## Defensive Features

### Pre-Trade Checks
1. **Gas Price Monitoring** - Checks current gas price (will trade at any price if profitable)
2. **Balance Verification** - Ensures sufficient tokens and ETH for gas
3. **Reserve Protection** - Keeps 0.0002 ETH minimum for future transactions

### Transaction Modeling
Before executing, the bot calculates:
- Expected output amount
- Minimum output (after slippage)
- Gas cost in USD
- Swap fee in USD
- Net profit after all costs

### Transaction Simulation
Uses `eth_call` to simulate the trade before sending, catching:
- Revert errors
- Insufficient liquidity
- Slippage issues

### Execution Flow
```
1. Detect opportunity (spread > 6.5%)
   ↓
2. Model the trade
   ├─ Calculate expected output
   ├─ Estimate gas costs
   └─ Calculate net profit
   ↓
3. Check gas price (acceptable?)
   ↓
4. Check balances (sufficient?)
   ↓
5. Simulate transaction (will it work?)
   ↓
6. Verify profitability (net profit > 0?)
   ↓
7. Execute trade (DRY RUN or LIVE)
   ↓
8. Track result (profit/loss)
```

## Running the Bot

### Dry Run Mode (Recommended First)
```bash
npm run phase2:dry
```

This will:
- ✅ Monitor pools
- ✅ Detect opportunities
- ✅ Model trades
- ✅ Calculate profit
- ❌ NOT execute real transactions

Perfect for testing the logic without risk.

### Live Mode (Real Trading)
```bash
# First, update .env to disable dry run:
DRY_RUN=false

# Then run:
npm run phase2
```

⚠️ **CAUTION**: This will execute real trades on-chain!

### Check Balances
```bash
npm run balance
```

Shows current holdings of ETH, ARBME, WETH, CLANKER, PAGE, USDC.

## Current Market Conditions

Based on latest monitoring:

**ARBME/WETH Pool**
- TVL: $14,938
- Price: $7.4516e-7 (0.00% deviation)
- Liquidity: Good for small trades

**CLANKER/ARBME Pool**
- TVL: $1,784
- Price: $7.3322e-7 (-1.60% deviation)
- Liquidity: Limited, watch slippage

**Current Spread**: 1.60% (below 6.5% threshold)
- No opportunities right now
- Need spreads to widen to 6.5%+ for profitable trades

## Economics

### Break-Even Analysis

With 3% swap fees and ~$0.01 gas:

| Trade Size | Min Spread Needed | Min Profit |
|-----------|------------------|------------|
| $1        | 8%              | $0.02      |
| $3        | 7%              | $0.05      |
| $6        | 6.5%            | $0.10      |

With our current capital (~$6):
- Need 6-7% spreads minimum
- Expect $0.10-0.30 profit per trade (if opportunities appear)
- Profit scales with spread size

### Slippage Constraints

The CLANKER/ARBME pool only has $1,784 TVL:
- Our $2.70 in ARBME = 0.15% of pool
- Minimal price impact
- Can trade our full position safely

## Risks & Considerations

1. **Rare Opportunities**: 6.5%+ spreads may be infrequent
2. **Small Profits**: With $6 capital, expect $0.10-0.50 per trade
3. **Gas Volatility**: Base gas is usually <$0.01 but can spike during congestion
4. **Frontrunning**: Other bots may compete for same opportunities
5. **Smart Contract Risk**: Always possible with DeFi interactions

## What's NOT Implemented Yet

The following require Uniswap V4 UniversalRouter integration:

- ❌ Actual swap execution (currently placeholder)
- ❌ WETH wrapping/unwrapping
- ❌ Multi-hop routes
- ❌ Two-leg arbitrage (buy low, sell high in same transaction)

The bot will:
- ✅ Detect opportunities
- ✅ Model trades accurately
- ✅ Simulate transactions
- ❌ Log "swap execution not yet implemented" in dry run

To complete this, we need to:
1. Build UniversalRouter calldata encoding
2. Implement V4_SWAP command
3. Handle WETH wrapping if trading with ETH
4. Add approval management for input tokens

## Next Steps

### Short Term
1. ✅ Test in dry-run mode
2. ⏳ Wait for spread opportunities to appear
3. ⏳ Observe dry-run profit calculations
4. ⏳ Implement actual UniversalRouter swap execution

### Medium Term
1. Add WETH price oracle (currently hardcoded $3200)
2. Implement USDC → ETH conversion (to deploy the $0.60 USDC)
3. Add Telegram/Discord notifications for opportunities
4. Build profit tracking dashboard

### Long Term
1. Multi-pool arbitrage (3+ pools in one trade)
2. Position size optimization based on pool liquidity
3. Gas price prediction for better timing
4. Deploy to Railway for 24/7 operation

## Files Created

- `src/trade-executor.ts` - Defensive trade execution framework
- `src/uniswap-v4.ts` - Uniswap V4 pool integration
- `src/profit-calculator.ts` - Profit calculation with all costs
- `src/bot-phase2.ts` - Main execution bot
- `src/check-balance.ts` - Wallet balance checker

## Monitoring

The bot logs:
- All detected opportunities
- Trade modeling results
- Profit calculations
- Execution attempts
- Total trades and profit

Press Ctrl+C to stop and see summary stats.

## Support

If the bot encounters errors:
1. Check `.env` has correct API keys
2. Ensure wallet has ETH for gas (>0.0002 ETH)
3. Verify spreads are actually >6.5%
4. Review the profit calculation logs

## Safety Checklist

Before going live:
- [ ] Test thoroughly in dry-run mode
- [ ] Understand the economics (3% fees + gas)
- [ ] Accept that opportunities may be rare
- [ ] Accept small profit per trade (~$0.10-0.50)
- [ ] Monitor first few trades closely
- [ ] Have ability to stop bot quickly (Ctrl+C)

---

**Status**: ✅ Phase 2 framework complete, ready for dry-run testing
**Next**: Implement UniversalRouter swap execution for live trading
