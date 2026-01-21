/**
 * ArbMe Unified Server
 * - Runs arbitrage bot in background
 * - Serves API endpoints (/pools, etc.)
 * - Serves Farcaster miniapp (/app)
 * - Serves landing page (/)
 */

import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fetchPools, fetchUserPositions, buildCollectFeesTransaction } from '@arbme/core-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════════
// START BOT IN BACKGROUND
// ═══════════════════════════════════════════════════════════════════════════════

let botProcess: any = null;

function startBot() {
  console.log('[Server] Starting arbitrage bot in background...');

  // Run the phase2 bot from packages/bot
  botProcess = spawn('tsx', ['packages/bot/src/bot-phase2.ts'], {
    cwd: path.join(__dirname, '../..'),
    stdio: 'inherit', // Show bot logs
    env: process.env
  });

  botProcess.on('error', (err: any) => {
    console.error('[Server] Bot process error:', err);
  });

  botProcess.on('exit', (code: number) => {
    console.log(`[Server] Bot process exited with code ${code}`);
    // Restart bot on crash
    if (code !== 0) {
      console.log('[Server] Restarting bot in 5 seconds...');
      setTimeout(startBot, 5000);
    }
  });
}

// Start bot on server start
startBot();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  if (botProcess) botProcess.kill();
  process.exit(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// API ROUTES - These will be ported from worker
// ═══════════════════════════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bot: botProcess ? 'running' : 'stopped',
    uptime: process.uptime()
  });
});

// Version check - to verify which code is deployed
app.get('/version', (req, res) => {
  res.json({
    version: '1.0.3-onchain-pricing',
    features: {
      onChainPricing: true,
      debugLogging: true,
    },
    env: {
      hasAlchemyKey: !!process.env.ALCHEMY_API_KEY,
    },
  });
});

// Pools API - Native implementation
const poolsHandler = async (req: any, res: any) => {
  try {
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const data = await fetchPools(alchemyKey);
    res.json(data);
  } catch (error) {
    console.error('[Server] Failed to fetch pools:', error);
    res.status(500).json({ error: 'Failed to fetch pools' });
  }
};
app.get('/pools', poolsHandler);
app.get('/app/api/pools', poolsHandler);

// Positions API - Get user positions
const positionsHandler = async (req: any, res: any) => {
  try {
    const { wallet } = req.query;
    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    console.log(`[Server] Fetching positions for wallet: ${wallet}`);
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const positions = await fetchUserPositions(wallet, alchemyKey);

    console.log(`[Server] Found ${positions.length} positions`);
    res.json(positions);
  } catch (error) {
    console.error('[Server] Failed to fetch positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
};
app.get('/api/positions', positionsHandler);
app.get('/app/api/positions', positionsHandler);

// Position Detail API - Get single position
const positionDetailHandler = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { wallet } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Position ID required' });
    }
    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    console.log(`[Server] Fetching position ${id} for wallet: ${wallet}`);
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const positions = await fetchUserPositions(wallet, alchemyKey);
    const position = positions.find(p => p.id === id);

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    res.json(position);
  } catch (error) {
    console.error('[Server] Failed to fetch position:', error);
    res.status(500).json({ error: 'Failed to fetch position' });
  }
};
app.get('/api/position/:id', positionDetailHandler);
app.get('/app/api/position/:id', positionDetailHandler);

// Collect Fees API - Build transaction to collect fees from a position
const collectFeesHandler = async (req: any, res: any) => {
  try {
    const { positionId, recipient } = req.body;

    if (!positionId || typeof positionId !== 'string') {
      return res.status(400).json({ error: 'Position ID required' });
    }
    if (!recipient || typeof recipient !== 'string') {
      return res.status(400).json({ error: 'Recipient address required' });
    }

    console.log(`[Server] Building collect fees transaction for position: ${positionId}`);
    const transaction = buildCollectFeesTransaction({ positionId, recipient });

    res.json(transaction);
  } catch (error) {
    console.error('[Server] Failed to build collect fees transaction:', error);
    res.status(500).json({ error: 'Failed to build transaction' });
  }
};
app.post('/api/collect-fees', collectFeesHandler);
app.post('/app/api/collect-fees', collectFeesHandler);

// ═══════════════════════════════════════════════════════════════════════════════
// FARCASTER MINIAPP
// ═══════════════════════════════════════════════════════════════════════════════

// Farcaster manifest
app.get('/.well-known/farcaster.json', (req, res) => {
  res.json({
    accountAssociation: {
      header: "eyJmaWQiOjg1NzMsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHg1Mjk0MjMzMTViMTVEQTk2OTFBYkM1QjdjMWNiMEQwNDUwOUIyMmIwIn0",
      payload: "eyJkb21haW4iOiJhcmJtZS5lcGljZHlsYW4uY29tIn0",
      signature: "jj5/abViEfDDlZ8R3d/AkrX/DfG1T6hrwCTfE2zyWSFLmmGvuwRylt5OUc4ndbwI4eQ9xjAlL3Y7TFsEELUjExw="
    },
    miniapp: {
      version: "1",
      name: "ArbMe",
      iconUrl: "https://arbme.epicdylan.com/arbie.png",
      homeUrl: "https://arbme.epicdylan.com/app",
      imageUrl: "https://arbme.epicdylan.com/share-image.png",
      splashImageUrl: "https://arbme.epicdylan.com/arbie.png",
      splashBackgroundColor: "#0a0a0f",
      buttonTitle: "View Pools",
      subtitle: "Permissionless Arb Routes",
      description: "An ERC20 token that pairs with other tokens to create arb routes. LP to earn fees, arb to profit.",
      primaryCategory: "finance",
      tags: ["defi", "arbitrage", "liquidity", "base"],
      tagline: "LP to earn. Arb to profit.",
      heroImageUrl: "https://arbme.epicdylan.com/share-image.png",
      screenshotUrls: ["https://arbme.epicdylan.com/share-image.png"],
      ogTitle: "ArbMe - Permissionless Arb",
      ogDescription: "An ERC20 token that pairs with other tokens to create arb routes. No deals. No permission. Just LP.",
      ogImageUrl: "https://arbme.epicdylan.com/share-image.png"
    }
  });
});

// Miniapp - Proxy to Next.js standalone server (runs on port 3001)
// Start Next.js server in background
let nextProcess: any = null;

function startNextServer() {
  console.log('[Server] Starting Next.js server...');

  nextProcess = spawn('node', ['packages/nextjs/.next/standalone/packages/nextjs/server.js'], {
    cwd: path.join(__dirname, '../..'),
    stdio: 'inherit',
    env: { ...process.env, PORT: '3001', HOSTNAME: 'localhost' }
  });

  nextProcess.on('exit', (code: number) => {
    console.log(`[Server] Next.js server exited with code ${code}`);
    if (code !== 0) {
      console.log('[Server] Restarting Next.js server in 5 seconds...');
      setTimeout(startNextServer, 5000);
    }
  });
}

startNextServer();

// Proxy /_next/* static assets to Next.js (for when assetPrefix isn't set)
app.use('/_next', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
}));

// Proxy /app/* requests to Next.js
app.use('/app', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: {
    '^/app': '', // Strip /app prefix when forwarding to Next.js
  },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════════════════════════

// Serve static files from public directory (we'll create this)
app.use(express.static(path.join(__dirname, '../public')));

// Root - landing page
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ═══════════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`[Server] ArbMe server running on port ${PORT}`);
  console.log(`[Server] API: http://localhost:${PORT}/pools`);
  console.log(`[Server] Miniapp: http://localhost:${PORT}/app`);
  console.log(`[Server] Landing: http://localhost:${PORT}/`);
});
