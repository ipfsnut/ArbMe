# Uniswap V4 Swap Execution - Testing Guide

## 🎉 What's New

The bot now has **full swap execution capabilities** via Uniswap V4's UniversalRouter!

### ✅ Implemented Features

1. **Uniswap V4 UniversalRouter Integration**
   - Command encoding (V4_SWAP)
   - Action sequencing (SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL)
   - Pool key creation and management

2. **Token Approval Flow**
   - Step 1: Approve Permit2 to spend tokens
   - Step 2: Approve UniversalRouter via Permit2
   - Automatic allowance checking

3. **Swap Execution**
   - Real transaction submission
   - Receipt confirmation
   - Gas tracking

4. **Bot Integration**
   - Phase 2 bot now executes real swaps when opportunities appear
   - Dry-run mode still available for testing

## 📚 References

Based on official Uniswap V4 documentation:
- [Swap Quickstart](https://docs.uniswap.org/contracts/v4/quickstart/swap)
- [UniversalRouter on Base](https://basescan.org/address/0x6ff5693b99212da76ad316178a184ab56d299b43)

## 🧪 Testing Strategy

We'll test in **3 stages** with increasing risk:

### Stage 1: Tiny Test Swap (~$0.07)
Test with a small amount to verify the execution flow works.

### Stage 2: Monitoring with Execution Ready
Run bot in dry-run, manually execute if opportunity appears.

### Stage 3: Full Auto-Execution
Bot automatically executes profitable trades.

---

## Stage 1: Tiny Test Swap

**Objective**: Verify swap execution works with minimal risk.

### What It Does

Sells **100,000 ARBME** (~$0.07) for WETH on the ARBME/WETH pool.

**Economics**:
```
Input:  100,000 ARBME = $0.0745
Fee:    3% = $0.00224
Output: ~0.000023 WETH = $0.0723
Gas:    ~$0.01
```

This will **lose** about $0.02 total, but confirms execution works!

### How to Run

```bash
# From bot directory
npm run test:swap
```

### What to Expect

```
🧪 TESTING V4 SWAP WITH TINY AMOUNT
═══════════════════════════════════════════════════════════════
Wallet: 0x13B77...1812

Test Swap: Sell 100,000 ARBME for WETH
Amount: 100000000000000000000000 (100k ARBME)
Expected Value: ~$0.07

Executing swap...

🔄 EXECUTING V4 SWAP
═══════════════════════════════════════════════════════════════
Step 1: Checking approvals...
  ✅ Token already approved for Permit2 (or approving...)
  ✅ Router already approved via Permit2 (or approving...)

Step 2: Encoding swap...
  Pool: 0xC647...B07 / 0x4200...006
  Fee: 3%
  Direction: Token0 → Token1
  Amount In: 100000.0
  Min Out: 0.000022

Step 3: Executing swap...
  TX submitted: 0x...
  Waiting for confirmation...
═══════════════════════════════════════════════════════════════
✅ SWAP SUCCESSFUL!
  TX Hash: 0x...
  Gas Used: ...
  Status: success
═══════════════════════════════════════════════════════════════

✅ TEST SUCCESSFUL!
TX: https://basescan.org/tx/0x...
```

### Verification

1. Check BaseScan for the transaction
2. Verify you received WETH (check balance: `npm run balance`)
3. Confirm gas costs were low (<$0.02)

### If It Fails

**Common Issues**:

1. **"Insufficient ARBME balance"**
   - Run `npm run balance` to verify you have 100k+ ARBME
   - You have 3.6M, so this shouldn't happen

2. **"Token not approved"**
   - First swap will do 2 approval transactions
   - Then the swap transaction
   - Total: 3 transactions on first run

3. **"Execution reverted"**
   - Could be slippage (market moved)
   - Could be pool liquidity issue
   - Check BaseScan for revert reason

4. **"Insufficient ETH for gas"**
   - Need at least $0.05 in ETH
   - You have $3.35, so this shouldn't happen

---

## Stage 2: Monitoring with Manual Execution

Once the test swap works, we can monitor for opportunities and execute manually.

### Setup

Keep the bot running in dry-run mode:
```bash
npm run phase2:dry
```

### When Opportunity Appears

The bot will log:
```
🚨 OPPORTUNITIES DETECTED: 1

   1. SELL on ARBME / WETH
      Spread: 8.5%
      Est. Profit: $0.18
```

### Manual Execution Options

**Option A: Execute via bot (disable dry-run)**
```bash
# Stop current bot (Ctrl+C)
# Update .env: DRY_RUN=false
npm run phase2
```

**Option B: Execute partial position**
```bash
# Edit src/test-swap.ts to use desired amount
# Then run
npm run test:swap
```

---

## Stage 3: Full Auto-Execution

**⚠️ CAUTION**: This will automatically execute trades when 6.5%+ spreads appear!

### Enable Live Trading

1. **Update .env**:
   ```bash
   DRY_RUN=false
   ```

2. **Run the bot**:
   ```bash
   npm run phase2
   ```

3. **Monitor output**:
   - Bot will show all defensive checks
   - Only executes if all checks pass
   - Logs full transaction details

### Safety Features Active

- ✅ Minimum 0.0002 ETH reserved for gas
- ✅ Gas price checking (up to 100 gwei)
- ✅ Balance verification before each trade
- ✅ Transaction simulation before sending
- ✅ Profit verification (must be > $0)
- ✅ Slippage protection (1% tolerance)

### Monitoring While Running

```bash
# In another terminal, check balances periodically
npm run balance

# Check transaction history on BaseScan
# https://basescan.org/address/0x13B77C77BF208BbdE7bc2F1BB0083EB201CD1812
```

### Stopping the Bot

Press **Ctrl+C** to stop gracefully. The bot will log:
```
👋 Shutting down bot...
📊 Total opportunities detected: X
💰 Trades executed: Y
💵 Total profit: $Z
```

---

## Expected Behavior

### With Current Market (1.6% spread)

**No trades will execute** because:
- Spread = 1.6%
- Threshold = 6.5%
- Bot will log: "✅ No opportunities"

### When 6.5%+ Spread Appears

**Bot will automatically**:
1. Detect the opportunity
2. Model the trade
3. Check gas price (~$0.01 on Base)
4. Check balances
5. Simulate transaction
6. Calculate profit
7. **Execute if profitable**

**Full execution flow takes ~5-10 seconds**:
- 0-2 approval transactions (first time only)
- 1 swap transaction
- Receipt confirmation

### Position Sizing

Currently set to trade **full position** when opportunity appears:

- **Selling ARBME**: Uses all 3.6M ARBME
- **Buying ARBME**: Uses available ETH (minus 0.0002 reserve)

To adjust, edit `src/bot-phase2.ts:240-250`.

---

## Transaction Costs

### First Trade on a Pool

Will need **3 transactions**:
1. Approve ARBME for Permit2 (~$0.01)
2. Approve UniversalRouter via Permit2 (~$0.01)
3. Execute swap (~$0.01)

**Total**: ~$0.03

### Subsequent Trades

Only **1 transaction** (approvals already done):
- Execute swap (~$0.01)

### Gas Optimization

Base L2 is extremely cheap:
- Normal gas: <$0.01 per transaction
- High gas (congestion): $0.02-0.05
- Max bot will pay: $0.32 (100 gwei limit)

The bot will execute at **any gas price** if the trade is profitable after gas costs.

---

## Files Created

### Core Implementation
- `src/uniswap-v4-swap.ts` - UniversalRouter integration
  - Command encoding
  - Approval flow (Permit2)
  - Swap execution

### Testing
- `src/test-swap.ts` - Test script for tiny swaps
  - Safe testing with ~$0.07
  - Full execution flow
  - Error handling

### Integration
- `src/bot-phase2.ts` - Updated to use real execution
  - Pool key creation
  - Swap integration
  - Still supports dry-run mode

---

## Troubleshooting

### Approvals Taking Too Long

First trade needs 2 approvals. If they seem stuck:
```bash
# Check pending transactions on BaseScan
https://basescan.org/address/0x13B77C77BF208BbdE7bc2F1BB0083EB201CD1812
```

### Swap Failing with "Execution Reverted"

Possible causes:
1. **Slippage too tight**: Market moved between quote and execution
2. **Insufficient liquidity**: Pool doesn't have enough tokens
3. **Price impact too high**: Trade size too large for pool

Solution: Reduce trade size in test script

### Bot Not Executing Despite Opportunity

Check the logs - bot will explain why:
- Gas price too high?
- Insufficient balance?
- Simulation failed?
- Not profitable after costs?

---

## Next Steps

### After Successful Test Swap

1. ✅ Verify transaction on BaseScan
2. ✅ Check new balances match expectations
3. ✅ Run monitoring in dry-run for 24-48 hours
4. ✅ Observe opportunity frequency
5. ⏳ Decide if worth enabling auto-execution

### Potential Improvements

1. **WETH Wrapping**: Trade directly with ETH (unwrap WETH automatically)
2. **Position Sizing**: Dynamic sizing based on spread size
3. **Multi-Pool Routes**: Trade through 2-3 pools in one transaction
4. **Price Oracles**: Real-time ETH/WETH price instead of hardcoded $3200
5. **Notifications**: Telegram/Discord alerts when trades execute

---

## Safety Checklist

Before enabling auto-execution:

- [ ] Test swap completed successfully
- [ ] Understand the economics (3% fees + gas)
- [ ] Accept small profits per trade ($0.10-0.50)
- [ ] Monitored in dry-run mode for patterns
- [ ] Have ability to stop bot quickly (Ctrl+C)
- [ ] Know where to check transactions (BaseScan)
- [ ] Comfortable with capital at risk (~$6)

---

**Status**: ✅ Swap execution fully implemented and ready for testing

**Risk Level**:
- Test swap: 🟢 Low (~$0.02 loss)
- Auto-execution: 🟡 Medium (requires monitoring)

**Recommendation**: Start with test swap, then monitor in dry-run before enabling live execution.
