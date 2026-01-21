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
import {
  fetchPools,
  fetchUserPositions,
  buildCollectFeesTransaction,
  buildIncreaseLiquidityTransaction,
  buildDecreaseLiquidityTransaction,
  buildBurnPositionTransaction,
  getTokenDecimals,
  getTokenSymbol,
  getTokenName,
  getTokenAllowance,
  checkV2PoolExists,
  checkV3PoolExists,
  checkV4PoolExists,
  checkAeroPoolExists,
  buildApproveTransaction,
  buildV2CreatePoolTransaction,
  buildV3InitializePoolTransaction,
  buildV3MintPositionTransaction,
  buildV4InitializePoolTransaction,
  buildV4MintPositionTransaction,
  buildAeroInitializePoolTransaction,
  buildAeroMintPositionTransaction,
  calculateSqrtPriceX96,
  sortTokens,
  FEE_TO_TICK_SPACING,
  UNISWAP_FEE_TO_AERO_TICK_SPACING,
  AERO_SLIPSTREAM_POSITION_MANAGER,
} from '@arbme/core-lib';

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

// Increase Liquidity API - Build transaction to add liquidity to a position
const increaseLiquidityHandler = async (req: any, res: any) => {
  try {
    const { positionId, amount0Desired, amount1Desired, slippageTolerance } = req.body;

    if (!positionId || typeof positionId !== 'string') {
      return res.status(400).json({ error: 'Position ID required' });
    }
    if (!amount0Desired || !amount1Desired) {
      return res.status(400).json({ error: 'Token amounts required' });
    }

    console.log(`[Server] Building increase liquidity transaction for position: ${positionId}`);
    const transaction = buildIncreaseLiquidityTransaction({
      positionId,
      amount0Desired,
      amount1Desired,
      slippageTolerance,
    });

    res.json(transaction);
  } catch (error) {
    console.error('[Server] Failed to build increase liquidity transaction:', error);
    res.status(500).json({ error: 'Failed to build transaction' });
  }
};
app.post('/api/increase-liquidity', increaseLiquidityHandler);
app.post('/app/api/increase-liquidity', increaseLiquidityHandler);

// Decrease Liquidity API - Build transaction to remove liquidity from a position
const decreaseLiquidityHandler = async (req: any, res: any) => {
  try {
    const { positionId, liquidityPercentage, currentLiquidity, slippageTolerance } = req.body;

    if (!positionId || typeof positionId !== 'string') {
      return res.status(400).json({ error: 'Position ID required' });
    }
    if (liquidityPercentage === undefined || liquidityPercentage < 0 || liquidityPercentage > 100) {
      return res.status(400).json({ error: 'Valid liquidity percentage (0-100) required' });
    }
    if (!currentLiquidity) {
      return res.status(400).json({ error: 'Current liquidity required' });
    }

    console.log(`[Server] Building decrease liquidity transaction for position: ${positionId} (${liquidityPercentage}%)`);
    const transaction = buildDecreaseLiquidityTransaction({
      positionId,
      liquidityPercentage,
      currentLiquidity,
      slippageTolerance,
    });

    res.json(transaction);
  } catch (error) {
    console.error('[Server] Failed to build decrease liquidity transaction:', error);
    res.status(500).json({ error: 'Failed to build transaction' });
  }
};
app.post('/api/decrease-liquidity', decreaseLiquidityHandler);
app.post('/app/api/decrease-liquidity', decreaseLiquidityHandler);

// Burn Position API - Build transaction to close/burn a position NFT
const burnPositionHandler = async (req: any, res: any) => {
  try {
    const { positionId } = req.body;

    if (!positionId || typeof positionId !== 'string') {
      return res.status(400).json({ error: 'Position ID required' });
    }

    console.log(`[Server] Building burn position transaction for position: ${positionId}`);
    const transaction = buildBurnPositionTransaction({ positionId });

    res.json(transaction);
  } catch (error) {
    console.error('[Server] Failed to build burn position transaction:', error);
    res.status(500).json({ error: 'Failed to build transaction' });
  }
};
app.post('/api/burn-position', burnPositionHandler);
app.post('/app/api/burn-position', burnPositionHandler);

// ═══════════════════════════════════════════════════════════════════════════════
// POOL CREATION API
// ═══════════════════════════════════════════════════════════════════════════════

// Token cache for 5 minutes
const tokenCache = new Map<string, { info: any; timestamp: number }>();
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Token Info API - Get token details (symbol, name, decimals)
const tokenInfoHandler = async (req: any, res: any) => {
  try {
    const address = (req.query.address || req.body.address) as string;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Token address required' });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    // Check cache
    const cached = tokenCache.get(address.toLowerCase());
    if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
      return res.json(cached.info);
    }

    console.log(`[Server] Fetching token info for: ${address}`);

    // Fetch in parallel
    const [decimals, symbol, name] = await Promise.all([
      getTokenDecimals(address as any),
      getTokenSymbol(address as any).catch(() => 'UNKNOWN'),
      getTokenName(address as any).catch(() => 'Unknown Token'),
    ]);

    const info = { address, symbol, name, decimals };

    // Cache result
    tokenCache.set(address.toLowerCase(), { info, timestamp: Date.now() });

    res.json(info);
  } catch (error) {
    console.error('[Server] Failed to fetch token info:', error);
    res.status(500).json({ error: 'Failed to fetch token info' });
  }
};
app.get('/api/token-info', tokenInfoHandler);
app.get('/app/api/token-info', tokenInfoHandler);
app.post('/api/token-info', tokenInfoHandler);
app.post('/app/api/token-info', tokenInfoHandler);

// Check Pool Exists API
const checkPoolExistsHandler = async (req: any, res: any) => {
  try {
    const { version, token0, token1, fee } = req.body;

    if (!version || !token0 || !token1) {
      return res.status(400).json({ error: 'version, token0, and token1 required' });
    }

    // Sort tokens
    const [sortedToken0, sortedToken1] = sortTokens(token0, token1);

    console.log(`[Server] Checking ${version} pool: ${sortedToken0}/${sortedToken1} (fee: ${fee})`);

    let result;
    if (version === 'v2') {
      result = await checkV2PoolExists(sortedToken0, sortedToken1);
      res.json({ exists: result.exists, poolAddress: result.pair });
    } else if (version === 'v3') {
      if (!fee) {
        return res.status(400).json({ error: 'fee required for V3 pools' });
      }
      result = await checkV3PoolExists(sortedToken0, sortedToken1, fee);
      res.json({ exists: result.exists, poolAddress: result.pool });
    } else if (version === 'v4') {
      if (!fee) {
        return res.status(400).json({ error: 'fee required for V4 pools' });
      }
      const tickSpacing = FEE_TO_TICK_SPACING[fee];
      if (!tickSpacing) {
        return res.status(400).json({ error: 'Invalid fee tier for V4' });
      }
      result = await checkV4PoolExists(sortedToken0, sortedToken1, fee, tickSpacing);
      res.json({ exists: result.exists, initialized: result.initialized });
    } else if (version === 'aerodrome') {
      if (!fee) {
        return res.status(400).json({ error: 'fee required for Aerodrome pools' });
      }
      const tickSpacing = UNISWAP_FEE_TO_AERO_TICK_SPACING[fee];
      if (!tickSpacing) {
        return res.status(400).json({ error: 'Invalid fee tier for Aerodrome' });
      }
      result = await checkAeroPoolExists(sortedToken0, sortedToken1, tickSpacing);
      res.json({ exists: result.exists, poolAddress: result.pool });
    } else {
      return res.status(400).json({ error: 'Invalid version. Use v2, v3, v4, or aerodrome' });
    }
  } catch (error) {
    console.error('[Server] Failed to check pool exists:', error);
    res.status(500).json({ error: 'Failed to check pool' });
  }
};
app.post('/api/check-pool-exists', checkPoolExistsHandler);
app.post('/app/api/check-pool-exists', checkPoolExistsHandler);

// Check Approvals API
const checkApprovalsHandler = async (req: any, res: any) => {
  try {
    const { token0, token1, owner, spender, amount0Required, amount1Required } = req.body;

    if (!token0 || !token1 || !owner || !spender || !amount0Required || !amount1Required) {
      return res.status(400).json({ error: 'All parameters required' });
    }

    console.log(`[Server] Checking approvals for ${owner}`);

    // Check both tokens in parallel
    const [allowance0, allowance1] = await Promise.all([
      getTokenAllowance(token0, owner, spender),
      getTokenAllowance(token1, owner, spender),
    ]);

    const token0NeedsApproval = allowance0 < BigInt(amount0Required);
    const token1NeedsApproval = allowance1 < BigInt(amount1Required);

    res.json({
      token0NeedsApproval,
      token1NeedsApproval,
      token0Allowance: allowance0.toString(),
      token1Allowance: allowance1.toString(),
    });
  } catch (error) {
    console.error('[Server] Failed to check approvals:', error);
    res.status(500).json({ error: 'Failed to check approvals' });
  }
};
app.post('/api/check-approvals', checkApprovalsHandler);
app.post('/app/api/check-approvals', checkApprovalsHandler);

// Build Approval Transaction API
const buildApprovalHandler = async (req: any, res: any) => {
  try {
    const { token, spender } = req.body;

    if (!token || !spender) {
      return res.status(400).json({ error: 'token and spender required' });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(token) || !/^0x[a-fA-F0-9]{40}$/.test(spender)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    console.log(`[Server] Building approval: ${token} -> ${spender}`);
    const transaction = buildApproveTransaction(token as any, spender as any);

    res.json(transaction);
  } catch (error) {
    console.error('[Server] Failed to build approval:', error);
    res.status(500).json({ error: 'Failed to build approval transaction' });
  }
};
app.post('/api/build-approval', buildApprovalHandler);
app.post('/app/api/build-approval', buildApprovalHandler);

// Build Create Pool Transaction API
const buildCreatePoolHandler = async (req: any, res: any) => {
  try {
    const {
      version,
      token0,
      token1,
      amount0,
      amount1,
      fee,
      price,
      recipient,
      slippageTolerance,
    } = req.body;

    // Validate required params
    if (!version || !token0 || !token1 || !amount0 || !amount1 || !price || !recipient) {
      return res.status(400).json({
        error: 'version, token0, token1, amount0, amount1, price, and recipient required',
      });
    }

    if ((version === 'v3' || version === 'v4' || version === 'aerodrome') && !fee) {
      return res.status(400).json({ error: 'fee required for V3/V4/Aerodrome pools' });
    }

    console.log(`[Server] Building ${version} pool creation: ${token0}/${token1}`);

    // Fetch decimals
    const [decimals0, decimals1] = await Promise.all([
      getTokenDecimals(token0),
      getTokenDecimals(token1),
    ]);

    // Convert amounts to wei
    let amount0Wei = BigInt(Math.floor(parseFloat(amount0) * 10 ** decimals0));
    let amount1Wei = BigInt(Math.floor(parseFloat(amount1) * 10 ** decimals1));

    // Sort tokens
    const [sortedToken0, sortedToken1] = sortTokens(token0, token1);

    // If tokens were swapped, swap amounts and invert price
    let finalPrice = price;
    if (sortedToken0 !== token0) {
      [amount0Wei, amount1Wei] = [amount1Wei, amount0Wei];
      finalPrice = 1 / price;
    }

    // Calculate sqrtPriceX96
    const sqrtPriceX96 = calculateSqrtPriceX96(finalPrice);

    const transactions: any[] = [];

    if (version === 'v2') {
      const tx = buildV2CreatePoolTransaction({
        tokenA: sortedToken0 as any,
        tokenB: sortedToken1 as any,
        amountA: amount0Wei.toString(),
        amountB: amount1Wei.toString(),
        recipient: recipient as any,
        slippageTolerance,
      });
      transactions.push(tx);
    } else if (version === 'v3') {
      const initTx = buildV3InitializePoolTransaction({
        token0: sortedToken0 as any,
        token1: sortedToken1 as any,
        fee,
        sqrtPriceX96,
        amount0: amount0Wei.toString(),
        amount1: amount1Wei.toString(),
        recipient: recipient as any,
        slippageTolerance,
      });

      const mintTx = buildV3MintPositionTransaction({
        token0: sortedToken0 as any,
        token1: sortedToken1 as any,
        fee,
        sqrtPriceX96,
        amount0: amount0Wei.toString(),
        amount1: amount1Wei.toString(),
        recipient: recipient as any,
        slippageTolerance,
      });

      transactions.push(initTx, mintTx);
    } else if (version === 'v4') {
      const initTx = buildV4InitializePoolTransaction({
        token0: sortedToken0 as any,
        token1: sortedToken1 as any,
        fee,
        sqrtPriceX96,
        amount0: amount0Wei.toString(),
        amount1: amount1Wei.toString(),
        recipient: recipient as any,
        slippageTolerance,
      });

      const mintTx = buildV4MintPositionTransaction({
        token0: sortedToken0 as any,
        token1: sortedToken1 as any,
        fee,
        sqrtPriceX96,
        amount0: amount0Wei.toString(),
        amount1: amount1Wei.toString(),
        recipient: recipient as any,
        slippageTolerance,
      });

      transactions.push(initTx, mintTx);
    } else if (version === 'aerodrome') {
      const initTx = buildAeroInitializePoolTransaction({
        token0: sortedToken0 as any,
        token1: sortedToken1 as any,
        fee,
        sqrtPriceX96,
        amount0: amount0Wei.toString(),
        amount1: amount1Wei.toString(),
        recipient: recipient as any,
        slippageTolerance,
      });

      const mintTx = buildAeroMintPositionTransaction({
        token0: sortedToken0 as any,
        token1: sortedToken1 as any,
        fee,
        sqrtPriceX96,
        amount0: amount0Wei.toString(),
        amount1: amount1Wei.toString(),
        recipient: recipient as any,
        slippageTolerance,
      });

      transactions.push(initTx, mintTx);
    } else {
      return res.status(400).json({ error: 'Invalid version. Use v2, v3, v4, or aerodrome' });
    }

    res.json({ transactions });
  } catch (error) {
    console.error('[Server] Failed to build create pool transaction:', error);
    res.status(500).json({ error: 'Failed to build transaction' });
  }
};
app.post('/api/build-create-pool', buildCreatePoolHandler);
app.post('/app/api/build-create-pool', buildCreatePoolHandler);

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
