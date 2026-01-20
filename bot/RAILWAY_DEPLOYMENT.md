# Railway Deployment Guide

## Overview

This unified server runs:
1. **Arbitrage bot** in background (monitoring pools for arb opportunities)
2. **API endpoints** (`/pools`, etc.)
3. **Farcaster miniapp** (`/app`)
4. **Landing page** (`/`)

## Deploy to Railway

1. **Connect Repository**
   - Go to [Railway](https://railway.app)
   - Create new project
   - Connect to this GitHub repo
   - Select `/bot` directory as root

2. **Environment Variables**

   Add these in Railway dashboard:
   ```
   PRIVATE_KEY=your_wallet_private_key
   BASE_RPC_URL=your_base_rpc_url
   MIN_SPREAD_PERCENT=6.5
   POLL_INTERVAL_MS=5000
   TRADE_SIZE_USD=35
   PORT=3000
   ```

3. **Custom Domain**

   In Railway dashboard → Settings → Domains:
   - Add custom domain: `arbme.epicdylan.com`
   - Railway will provide DNS records to add

4. **Generate Farcaster Account Association**

   Go to https://warpcast.com/~/developers/miniapps and use the debugger:
   - Domain: `arbme.epicdylan.com`
   - Click "Generate account association"
   - Copy the header, payload, and signature values
   - Update `/src/server.ts` lines 95-99 with new values

## Routes

Once deployed:
- `https://arbme.epicdylan.com/` → Landing page
- `https://arbme.epicdylan.com/app` → Farcaster miniapp
- `https://arbme.epicdylan.com/pools` → Pools API
- `https://arbme.epicdylan.com/health` → Health check
- `https://arbme.epicdylan.com/.well-known/farcaster.json` → Miniapp manifest

## Local Development

```bash
npm install
npm run server
```

Server runs on http://localhost:3000

## Bot Control

The bot runs automatically in the background. To control it:
- Check logs in Railway dashboard
- Bot restarts automatically on crash
- Set `DRY_RUN=true` for testing without executing trades

## Migration from Cloudflare Workers

This server currently **proxies** to the Cloudflare worker for:
- `/pools` API
- `/app` miniapp HTML

**TODO:** Port worker logic directly to Express routes for full independence from Cloudflare.

## Architecture

```
Railway Server (Node.js + Express)
├── Background Bot Process (tsx src/bot-phase2.ts)
├── Express API Server (port 3000)
│   ├── GET / → Static landing page
│   ├── GET /app → Miniapp HTML (proxied from worker)
│   ├── GET /pools → Pool data (proxied from worker)
│   ├── GET /.well-known/farcaster.json → Manifest
│   └── GET /health → Status check
└── Static Files (public/)
    ├── index.html (landing page)
    └── *.png (assets)
```

## Deployment Status

- ✅ Server setup complete
- ✅ Bot integration complete
- ✅ API proxy working
- ✅ Railway configuration ready
- ⏳ Waiting for custom domain DNS setup
- ⏳ Need to generate Farcaster account association for arbme.epicdylan.com
