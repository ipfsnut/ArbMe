# ARBME Market Making Bot - Trading Strategy

## 🎯 Option 3: Full 3-Token Rotation (IMPLEMENTED)

### Portfolio Structure

**Reserves (Always Keep):**
- ETH: 0.0003 (~$0.96) - For gas + minimum buying power
- ARBME: 1M (~$0.75) - Always have some to sell
- CLANKER: 0.00002 (~$0.60) - For buying ARBME back
- WETH: 0.0001 (~$0.32) - Small reserve

**Position Sizing:**
- Trade up to **60% of available balance** (balance - reserve)
- Keep 40% + reserves for future opportunities
- Max trade size: **$2.00** per trade

**Target Allocation:**
- 30% ETH (buying power + gas)
- 50% ARBME (main asset)
- 10% CLANKER (rotation)
- 10% WETH (rotation)

### Trading Flow

```
┌─────────────────────────────────────────────┐
│  ARBME Price Monitoring                     │
│  Reference: API Average (~$7.45e-7)         │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴──────────┐
        │                      │
        ▼                      ▼
┌──────────────┐      ┌──────────────┐
│ Pool Price   │      │ Pool Price   │
│ HIGHER       │      │ LOWER        │
│              │      │              │
│ SELL ARBME   │      │ BUY ARBME    │
└──────────────┘      └──────────────┘
        │                      │
        │                      │
   ┌────┴────┐            ┌────┴────┐
   │         │            │         │
   ▼         ▼            ▼         ▼
┌────────┐ ┌──────┐   ┌────────┐ ┌──────┐
│ → WETH │ │→CLNKR│   │ETH →  │ │CLNKR→ │
└────────┘ └──────┘   └────────┘ └──────┘
```

### Example Scenarios

**Scenario 1: ARBME is cheap in WETH pool**
```
Current: 3.6M ARBME, 0.001 ETH, 0 CLANKER
ARBME/WETH pool: $6.8e-7 (8% below reference)

Action: BUY ARBME with ETH
- Use: 60% of available ETH (~0.0005 ETH)
- Get: ~2M more ARBME
Result: 5.6M ARBME, 0.0005 ETH, 0 CLANKER
```

**Scenario 2: ARBME is expensive in CLANKER pool**
```
Current: 5.6M ARBME, 0.0005 ETH, 0 CLANKER
CLANKER/ARBME pool: $8.2e-7 (10% above reference)

Action: SELL ARBME for CLANKER
- Use: 60% of available ARBME (~2.7M ARBME)
- Get: ~0.0003 CLANKER
Result: 2.9M ARBME, 0.0005 ETH, 0.0003 CLANKER
```

**Scenario 3: ARBME is cheap in CLANKER pool**
```
Current: 2.9M ARBME, 0.0005 ETH, 0.0003 CLANKER
CLANKER/ARBME pool: $6.5e-7 (12% below reference)

Action: BUY ARBME with CLANKER ✅ NEW!
- Use: 60% of available CLANKER
- Get: ~1M more ARBME
Result: 3.9M ARBME, 0.0005 ETH, 0.0001 CLANKER
```

### How It Avoids Running Out of Money

1. **Reserves Protected** - Always keep minimum amounts untouchable
2. **Position Sizing** - Never trade more than 60% of available balance
3. **Multi-Token Capability** - Can trade with ETH, ARBME, or CLANKER
4. **Rotation Enabled** - Full cycle possible:
   - ETH → ARBME → CLANKER → ARBME → ETH

5. **Trade Size Caps** - Max $2 per trade prevents overexposure

### Safety Features

- ✅ Profit calculation BEFORE executing
- ✅ Gas cost consideration
- ✅ Slippage protection
- ✅ Balance checks before trading
- ✅ Dry-run mode for testing
- ✅ Portfolio rebalancing awareness

### Expected Behavior

**After 10 trades, you might have:**
- Portfolio distributed across all 3 tokens
- Net profit from spreads (after fees & gas)
- Always have reserves to trade in any direction
- Natural rebalancing as you buy low / sell high

**You WON'T:**
- Get stuck with only one token
- Run out of gas money
- Over-trade your entire balance
- Miss opportunities due to lack of tokens

### Current Status

**Monitoring:** 2 pools (ARBME/WETH, CLANKER/ARBME)
**Min Spread:** 6.5% required
**Mode:** DRY_RUN (change to live when ready)
**SDK:** ✅ Working V4 swap integration
**CLANKER Trading:** ✅ Enabled (both buy & sell)

Ready to deploy! 🚀
