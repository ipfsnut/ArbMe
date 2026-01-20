# ARBME Market Making Bot

A 24/7 monitoring bot for market making opportunities across ARBME 3% fee pools on Base.

## Quick Start (Railway Deployment)

### 1. Install Dependencies

```bash
cd bot
npm install
```

### 2. Set Up Environment Variables Locally

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Test Your Setup

```bash
npm run test
```

You should see:
```
✅ Block number: 12345678
✅ Reserve0: 123.45 CLANKER
✅ Reserve1: 1234567890.12 ARBME
🎉 All tests passed!
```

### 4. Run Locally (Optional)

```bash
npm start
```

You should see the bot monitoring pools and reporting spreads.

### 5. Deploy to Railway

#### Option A: CLI Deployment (Fastest)

```bash
# Make sure you're in the bot directory
cd bot

# Login to Railway (if not already)
railway login

# Initialize new project
railway init

# Link to your Railway project (creates new one if needed)
railway link

# Add environment variables
railway variables set BASE_RPC_URL=https://mainnet.base.org
railway variables set MIN_SPREAD_PERCENT=6.5
railway variables set EXTERNAL_PRICE_CLANKER=33
railway variables set EXTERNAL_PRICE_WETH=3200
railway variables set EXTERNAL_PRICE_PAGE=0.00015

# Deploy!
railway up
```

#### Option B: GitHub Deployment (Recommended for Production)

1. Push this bot directory to a GitHub repo:
   ```bash
   git add .
   git commit -m "Add market making bot"
   git push origin main
   ```

2. Go to [railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repo
5. Railway auto-detects Node.js and uses `railway.json` config
6. Add environment variables in Railway dashboard:
   - `BASE_RPC_URL` = `https://mainnet.base.org`
   - `MIN_SPREAD_PERCENT` = `6.5`
   - `EXTERNAL_PRICE_CLANKER` = `33`
   - `EXTERNAL_PRICE_WETH` = `3200`
   - `EXTERNAL_PRICE_PAGE` = `0.00015`

7. Click "Deploy"

### 6. Monitor Your Bot

In Railway dashboard:
- Click on your deployment
- Go to "Logs" tab
- You'll see live console output with pool states and opportunities

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BASE_RPC_URL` | Yes | `https://mainnet.base.org` | Base mainnet RPC endpoint |
| `ALCHEMY_API_KEY` | No | - | Alchemy API key (recommended for better performance) |
| `MIN_SPREAD_PERCENT` | No | `6.5` | Minimum spread % to trigger opportunity alert |
| `POLL_INTERVAL_MS` | No | `2000` | How often to poll pools (milliseconds) |
| `TRADE_SIZE_USD` | No | `35` | Trade size for profit calculations |
| `BOT_PHASE` | No | `1` | 1=monitoring, 2=manual, 3=auto (future) |
| `EXTERNAL_PRICE_CLANKER` | Yes | `33` | Current CLANKER price in USD |
| `EXTERNAL_PRICE_WETH` | Yes | `3200` | Current WETH price in USD |
| `EXTERNAL_PRICE_PAGE` | Yes | `0.00015` | Current PAGE price in USD |

## Using Alchemy (Recommended)

Alchemy provides faster, more reliable RPC:

1. Sign up at [alchemy.com](https://www.alchemy.com/)
2. Create a new app for "Base Mainnet"
3. Copy your API key
4. Set in Railway:
   ```bash
   railway variables set ALCHEMY_API_KEY=your_key_here
   ```

## Updating External Prices

The bot needs external prices for CLANKER, WETH, and PAGE to calculate USD values.

**Option 1: Manual Updates (Simple)**
```bash
# Update prices in Railway dashboard when they change significantly
railway variables set EXTERNAL_PRICE_CLANKER=35
railway variables set EXTERNAL_PRICE_WETH=3300
```

**Option 2: CoinGecko API (Future Enhancement)**
- Integrate CoinGecko API to fetch prices automatically
- See TODO in `src/index.ts`

## Cost Estimate

**Railway Usage:**
- ~512MB RAM
- Minimal CPU (polling every 2 seconds)
- **Estimated cost: $5-8/month**

**RPC Costs:**
- Public Base RPC: Free (may have rate limits)
- Alchemy Free Tier: 300M compute units/month (plenty for this bot)
- Alchemy Growth: $50/month if you need more

**Gas Costs:**
- Phase 1 (monitoring): $0/month (no transactions)
- Phase 2+ (execution): <$1/month on Base

## Monitoring Opportunities

The bot will display opportunities like this:

```
🚨 OPPORTUNITIES DETECTED:
   1. Spread: 7.2%
      BUY:  CLANKER/ARBME @ $7.2e-7
      SELL: PAGE/ARBME @ $7.8e-7
      Est. Profit: +$0.65
```

**What this means:**
- ARBME is 7.2% cheaper in CLANKER pool vs PAGE pool
- If you execute: buy ARBME with CLANKER, sell ARBME for PAGE
- Estimated profit: $0.65 (after 3% fees on each side + gas)

## Next Steps (Phase 2)

Once you've verified opportunities exist:

1. **Add transaction execution logic**
   - Integrate wallet signing with viem
   - Build swap transactions
   - Test with small amounts

2. **Add inventory tracking**
   - Monitor your ARBME, CLANKER, PAGE balances
   - Rebalance when imbalanced

3. **Add safety features**
   - Circuit breakers
   - Max trade limits
   - Kill switch

## Troubleshooting

**Bot crashes on startup:**
- Check Railway logs for error messages
- Verify environment variables are set
- Test RPC connection with `npm run test`

**No opportunities found:**
- This is expected! 6.5%+ spreads are rare
- Try lowering `MIN_SPREAD_PERCENT` to 3-4% to see more activity
- Opportunities increase during volatile periods

**"Failed to fetch pool states":**
- RPC may be rate limiting
- Switch to Alchemy
- Increase `POLL_INTERVAL_MS` to reduce request frequency

## Support

Questions? Issues?
- Check Railway logs first
- Review environment variables
- Test RPC connection locally with `npm run test`

## Development

```bash
# Run with auto-reload on code changes
npm run dev

# Build TypeScript
npm run build

# Run built version
node dist/index.js
```

## Architecture

```
┌─────────────────────────────────────┐
│  Railway (24/7)                     │
│  ├── Bot (Node.js)                  │
│  │   ├── Poll pools every 2s        │
│  │   ├── Calculate spreads          │
│  │   └── Log opportunities          │
│  └── Auto-restart on crash          │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Base Mainnet RPC                   │
│  └── Fetch pool reserves            │
└─────────────────────────────────────┘
```

## Phases

- ✅ **Phase 1**: Monitoring (current) - Detect and log opportunities
- 🔲 **Phase 2**: Manual execution - Approve and execute trades manually
- 🔲 **Phase 3**: Automated execution - Full bot with risk management
