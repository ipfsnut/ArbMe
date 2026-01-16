/**
 * ArbMe API Worker
 * Uses GeckoTerminal API for pool data and token prices
 */

interface Env {
  ARBME_TOKEN: string;
  CACHE_TTL: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ARBME token on Base
const ARBME = {
  address: "0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07",
  symbol: "ARBME",
  decimals: 18,
};

// Token addresses for price lookups
const TOKENS = {
  PAGE: "0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE",
  OINC: "0x59e058780dd8a6017061596a62288b6438edbe68",
};

// GeckoTerminal API
const GECKO_API = "https://api.geckoterminal.com/api/v2";

// Base RPCs (primary + backup)
const BASE_RPCS = [
  "https://mainnet.base.org",
  "https://rpc.ankr.com/base",
  "https://base.drpc.org",
];

// V2 Pool config
const PAGE_ARBME_POOL = {
  address: "0x11FD4947bE07E721B57622df3ef1E1C773ED5655",
  token0: TOKENS.PAGE, // PAGE is token0
  token1: ARBME.address, // ARBME is token1
  token0Decimals: 8,
  token1Decimals: 18,
};

// V4 Pool config (OINC/ARBME)
const OINC_ARBME_POOL = {
  poolId: "0x7c49e36001206a7bb059ceaa5d1ed5485b332eac55fd3efff5e667b72329dd83",
  positionId: 974575,
  token0: TOKENS.OINC, // OINC is currency0
  token1: ARBME.address, // ARBME is currency1
  token0Decimals: 18,
  token1Decimals: 18,
  // Liquidity from creation tx 0x1366b8bfae1c75a9b391b8a2d649431b93b254dcb4c30d3493b6a6e5be7fff15
  // These are the actual deposited amounts (no additional liquidity events found)
  oincAmount: 12306310.02,
  arbmeAmount: 49222105.95,
};

// Uniswap V4 contracts on Base
const STATE_VIEW = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71";
const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
const GET_SLOT0 = "0xc815641c"; // getSlot0(bytes32 poolId)
const BALANCE_OF = "0x70a08231"; // balanceOf(address)

// Function selectors
const GET_RESERVES = "0x0902f1ac";

interface GeckoPoolData {
  id: string;
  attributes: {
    address: string;
    name: string;
    base_token_price_usd: string;
    quote_token_price_usd: string;
    reserve_in_usd: string;
    price_change_percentage: { h24: string };
    volume_usd: { h24: string };
  };
  relationships: {
    base_token: { data: { id: string } };
    quote_token: { data: { id: string } };
    dex: { data: { id: string } };
  };
}

interface PoolData {
  pair: string;
  pairAddress: string;
  dex: string;
  tvl: number;
  volume24h: number;
  priceUsd: string;
  priceChange24h: number;
  url: string;
  source: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/pools" || url.pathname === "/") {
      const forceRefresh = url.searchParams.get("refresh") === "true";
      return handlePools(request, env, ctx, forceRefresh);
    }

    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok", token: ARBME.address });
    }

    if (url.pathname === "/.well-known/farcaster.json") {
      return handleManifest();
    }

    // Farcaster Mini App endpoints
    if (url.pathname === "/frame-image") {
      return handleFrameImage(request, env, ctx);
    }

    if (url.pathname === "/og-image") {
      return handleOgImage(request, env, ctx);
    }

    if (url.pathname === "/icon") {
      return handleIcon();
    }

    if (url.pathname === "/splash") {
      return handleSplash();
    }

    if (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg") {
      return handleFavicon();
    }

    if (url.pathname === "/screenshot") {
      return handleScreenshot(request, env, ctx);
    }

    if (url.pathname === "/app") {
      return handleMiniApp(request, env, ctx);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};

async function handlePools(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  forceRefresh: boolean
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/pools", request.url).toString());
  const cacheTtl = parseInt(env.CACHE_TTL) || 60;

  if (!forceRefresh) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-Cache", "HIT");
      return new Response(cached.body, { headers });
    }
  }

  try {
    // Fetch all data in parallel
    const [arbmePools, pagePrice, oincPrice] = await Promise.all([
      fetchGeckoTerminalPools(ARBME.address),
      fetchTokenPrice(TOKENS.PAGE),
      fetchTokenPrice(TOKENS.OINC),
    ]);

    console.log(`[ArbMe] PAGE price: $${pagePrice}, OINC price: $${oincPrice}`);

    // Fetch PAGE/ARBME V2 pool and OINC/ARBME V4 pool
    const [pageArbmePool, oincArbmePool] = await Promise.all([
      fetchPageArbmePool(pagePrice),
      fetchOincArbmePool(oincPrice),
    ]);

    // Combine all pools, avoiding duplicates
    // GeckoTerminal may already have PAGE/ARBME and OINC/ARBME - check by address
    const allPools = [...arbmePools];

    // Only add PAGE/ARBME from RPC if not already in GeckoTerminal results
    const hasPagePool = arbmePools.some(p =>
      p.pairAddress.toLowerCase() === PAGE_ARBME_POOL.address.toLowerCase() ||
      p.pair.toUpperCase().includes("PAGE")
    );
    if (pageArbmePool && !hasPagePool) {
      allPools.push(pageArbmePool);
    }

    // Only add OINC/ARBME from RPC if not already in GeckoTerminal results
    const hasOincPool = arbmePools.some(p =>
      p.pair.toUpperCase().includes("OINC")
    );
    if (oincArbmePool && !hasOincPool) {
      allPools.push(oincArbmePool);
    }

    // Sort by TVL
    allPools.sort((a, b) => b.tvl - a.tvl);

    const totalTvl = allPools.reduce((sum, p) => sum + p.tvl, 0);
    const arbmePrice = allPools.find(p => p.tvl > 0)?.priceUsd || "0";

    const responseData = {
      token: ARBME.address,
      poolCount: allPools.length,
      totalTvl,
      arbmePrice,
      tokenPrices: {
        PAGE: pagePrice,
        OINC: oincPrice,
      },
      pools: allPools,
      lastUpdated: new Date().toISOString(),
    };

    const response = jsonResponse(responseData, {
      "Cache-Control": `public, max-age=${cacheTtl}`,
      "X-Cache": "MISS",
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;

  } catch (error) {
    console.error("[ArbMe] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: "Failed to fetch pools", details: msg }, {}, 500);
  }
}

/**
 * Fetch pools for a token from GeckoTerminal
 */
async function fetchGeckoTerminalPools(tokenAddress: string): Promise<PoolData[]> {
  try {
    const response = await fetch(
      `${GECKO_API}/networks/base/tokens/${tokenAddress.toLowerCase()}/pools?page=1`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) {
      console.error(`[ArbMe] GeckoTerminal error: ${response.status}`);
      return [];
    }

    const data = await response.json() as { data: GeckoPoolData[] };
    if (!data.data?.length) return [];

    const pools: PoolData[] = [];

    for (const pool of data.data) {
      const attrs = pool.attributes;
      const tvl = parseFloat(attrs.reserve_in_usd) || 0;
      const volume24h = parseFloat(attrs.volume_usd?.h24) || 0;
      const priceChange24h = parseFloat(attrs.price_change_percentage?.h24) || 0;

      // Determine ARBME price
      const baseTokenId = pool.relationships.base_token.data.id;
      const isArbmeBase = baseTokenId.toLowerCase().includes(tokenAddress.toLowerCase());
      const arbmePrice = isArbmeBase
        ? attrs.base_token_price_usd
        : attrs.quote_token_price_usd;

      // Clean pool name
      const poolName = attrs.name.replace(/\s+\d+(\.\d+)?%$/, "").trim();

      // Get DEX name
      const dexId = pool.relationships.dex.data.id.toLowerCase();
      let dexName = "DEX";
      if (dexId.includes("uniswap-v4") || dexId.includes("uniswap_v4")) dexName = "Uniswap V4";
      else if (dexId.includes("uniswap-v3") || dexId.includes("uniswap_v3")) dexName = "Uniswap V3";
      else if (dexId.includes("uniswap-v2") || dexId.includes("uniswap_v2")) dexName = "Uniswap V2";
      else if (dexId.includes("aerodrome")) dexName = "Aerodrome";

      pools.push({
        pair: poolName,
        pairAddress: attrs.address,
        dex: dexName,
        tvl,
        volume24h,
        priceUsd: arbmePrice,
        priceChange24h,
        url: `https://dexscreener.com/base/${attrs.address}`,
        source: "geckoterminal",
      });
    }

    console.log(`[ArbMe] Found ${pools.length} pools on GeckoTerminal`);
    return pools;

  } catch (error) {
    console.error("[ArbMe] GeckoTerminal fetch error:", error);
    return [];
  }
}

/**
 * Fetch token price from GeckoTerminal (uses highest TVL pool)
 */
async function fetchTokenPrice(tokenAddress: string): Promise<number> {
  try {
    const response = await fetch(
      `${GECKO_API}/networks/base/tokens/${tokenAddress.toLowerCase()}/pools?page=1`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) return 0;

    const data = await response.json() as { data: GeckoPoolData[] };
    if (!data.data?.length) return 0;

    // Find highest TVL pool with a stable pair (WETH, USDC, CLANKER)
    let bestPrice = 0;
    let bestTvl = 0;

    for (const pool of data.data) {
      const tvl = parseFloat(pool.attributes.reserve_in_usd) || 0;
      const name = pool.attributes.name.toLowerCase();

      // Prefer pools paired with stable/major tokens
      const isGoodPair = name.includes("weth") || name.includes("usdc") ||
                         name.includes("clanker") || name.includes("eth");

      if (tvl > bestTvl && isGoodPair) {
        const baseTokenId = pool.relationships.base_token.data.id;
        const isTokenBase = baseTokenId.toLowerCase().includes(tokenAddress.toLowerCase());
        const price = parseFloat(
          isTokenBase
            ? pool.attributes.base_token_price_usd
            : pool.attributes.quote_token_price_usd
        );

        if (price > 0) {
          bestPrice = price;
          bestTvl = tvl;
        }
      }
    }

    return bestPrice;
  } catch (error) {
    console.error(`[ArbMe] Error fetching price for ${tokenAddress}:`, error);
    return 0;
  }
}

// Cache key for RPC data
const RPC_CACHE_KEY = "arbme-rpc-reserves";
const RPC_CACHE_TTL = 120; // 2 minutes - longer than main cache

/**
 * Fetch PAGE/ARBME V2 pool data using RPC with caching and fallback
 */
async function fetchPageArbmePool(pagePrice: number): Promise<PoolData | null> {
  const cache = caches.default;

  // Try to get cached reserves first
  const cacheKey = new Request(`https://cache/${RPC_CACHE_KEY}`);
  const cached = await cache.match(cacheKey);

  let reserves: { pageAmount: number; arbmeAmount: number } | null = null;

  if (cached) {
    try {
      reserves = await cached.json();
      console.log("[ArbMe] Using cached PAGE/ARBME reserves");
    } catch {
      // Invalid cache, fetch fresh
    }
  }

  // If no cache, fetch from RPC
  if (!reserves) {
    reserves = await fetchReservesWithFallback();

    // Cache the reserves if we got them
    if (reserves) {
      const cacheResponse = new Response(JSON.stringify(reserves), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${RPC_CACHE_TTL}`,
        },
      });
      await cache.put(cacheKey, cacheResponse);
    }
  }

  if (!reserves) {
    return null;
  }

  const { pageAmount, arbmeAmount } = reserves;

  // Calculate TVL and ARBME price
  let tvl = 0;
  let arbmePrice = "0";

  if (pagePrice > 0 && pageAmount > 0) {
    const pageValue = pageAmount * pagePrice;
    tvl = pageValue * 2; // 50/50 pool

    if (arbmeAmount > 0) {
      arbmePrice = (pageValue / arbmeAmount).toString();
    }
  }

  console.log(`[ArbMe] PAGE/ARBME TVL: $${tvl.toFixed(2)}, ARBME price: $${arbmePrice}`);

  return {
    pair: "PAGE / ARBME",
    pairAddress: PAGE_ARBME_POOL.address,
    dex: "Uniswap V2",
    tvl,
    volume24h: 0,
    priceUsd: arbmePrice,
    priceChange24h: 0,
    url: `https://dexscreener.com/base/${PAGE_ARBME_POOL.address}`,
    source: "rpc",
  };
}

/**
 * Try multiple RPCs until one works
 */
async function fetchReservesWithFallback(): Promise<{ pageAmount: number; arbmeAmount: number } | null> {
  for (const rpcUrl of BASE_RPCS) {
    try {
      console.log(`[ArbMe] Trying RPC: ${rpcUrl}`);

      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_call",
          params: [{ to: PAGE_ARBME_POOL.address, data: GET_RESERVES }, "latest"],
          id: 1,
        }),
      });

      if (!response.ok) {
        console.log(`[ArbMe] RPC ${rpcUrl} returned ${response.status}, trying next...`);
        continue;
      }

      const json = await response.json() as { result?: string; error?: { message: string } };

      if (json.error) {
        console.log(`[ArbMe] RPC error from ${rpcUrl}: ${json.error.message}`);
        continue;
      }

      if (!json.result || json.result === "0x" || json.result.length < 130) {
        console.log(`[ArbMe] Invalid result from ${rpcUrl}`);
        continue;
      }

      const hex = json.result.slice(2);
      const reserve0 = Number(BigInt("0x" + hex.slice(0, 64)));
      const reserve1 = Number(BigInt("0x" + hex.slice(64, 128)));

      const pageAmount = reserve0 / Math.pow(10, PAGE_ARBME_POOL.token0Decimals);
      const arbmeAmount = reserve1 / Math.pow(10, PAGE_ARBME_POOL.token1Decimals);

      console.log(`[ArbMe] Got reserves from ${rpcUrl}: ${pageAmount.toFixed(2)} PAGE, ${arbmeAmount.toFixed(2)} ARBME`);

      return { pageAmount, arbmeAmount };

    } catch (error) {
      console.log(`[ArbMe] RPC ${rpcUrl} failed:`, error);
      continue;
    }
  }

  console.error("[ArbMe] All RPCs failed");
  return null;
}

/**
 * Fetch OINC/ARBME V4 pool data using StateView
 */
async function fetchOincArbmePool(oincPrice: number): Promise<PoolData | null> {
  try {
    console.log("[ArbMe] Fetching OINC/ARBME V4 pool from StateView...");

    // Query StateView.getSlot0(poolId)
    const callData = GET_SLOT0 + OINC_ARBME_POOL.poolId.slice(2);

    let slot0Result: string | null = null;

    // Try each RPC
    for (const rpcUrl of BASE_RPCS) {
      try {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_call",
            params: [{ to: STATE_VIEW, data: callData }, "latest"],
            id: 1,
          }),
        });

        if (!response.ok) continue;

        const json = await response.json() as { result?: string; error?: { message: string } };
        if (json.error || !json.result || json.result === "0x") continue;

        slot0Result = json.result;
        console.log(`[ArbMe] Got OINC/ARBME slot0 from ${rpcUrl}`);
        break;

      } catch {
        continue;
      }
    }

    if (!slot0Result) {
      console.log("[ArbMe] Failed to fetch OINC/ARBME slot0 from all RPCs");
      return null;
    }

    // Parse slot0: sqrtPriceX96 (uint160), tick (int24), protocolFee (uint24), lpFee (uint24)
    const data = slot0Result.slice(2);
    const sqrtPriceX96 = BigInt("0x" + data.slice(0, 64));

    if (sqrtPriceX96 === BigInt(0)) {
      console.log("[ArbMe] OINC/ARBME pool has zero sqrtPriceX96");
      return null;
    }

    // Calculate price from sqrtPriceX96
    // price (token1/token0) = (sqrtPriceX96 / 2^96)^2
    const Q96 = BigInt(2) ** BigInt(96);
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    const rawPrice = sqrtPrice * sqrtPrice;

    // OINC is token0, ARBME is token1
    // rawPrice = ARBME per OINC (in raw units, same decimals so no adjustment needed)
    // We want ARBME price in terms of OINC value
    // ARBME price = OINC price / rawPrice
    const arbmePrice = oincPrice > 0 && rawPrice > 0 ? oincPrice / rawPrice : 0;

    console.log(`[ArbMe] OINC/ARBME: sqrtPrice=${sqrtPrice.toFixed(8)}, rawPrice=${rawPrice.toFixed(8)}, ARBME=$${arbmePrice.toFixed(10)}`);

    // Calculate TVL from known liquidity (from creation tx)
    // TODO: Query for additional ModifyLiquidity events to update these values dynamically
    const oincValue = OINC_ARBME_POOL.oincAmount * oincPrice;
    const tvl = oincValue * 2; // 50/50 pool assumption

    console.log(`[ArbMe] OINC/ARBME: ${OINC_ARBME_POOL.oincAmount.toFixed(0)} OINC @ $${oincPrice.toFixed(10)}, TVL=$${tvl.toFixed(2)}`)

    return {
      pair: "OINC / ARBME",
      pairAddress: OINC_ARBME_POOL.poolId,
      dex: "Uniswap V4",
      tvl,
      volume24h: 0,
      priceUsd: arbmePrice.toString(),
      priceChange24h: 0,
      url: `https://dexscreener.com/base/${OINC_ARBME_POOL.poolId}`,
      source: "rpc-v4",
    };

  } catch (error) {
    console.error("[ArbMe] OINC/ARBME fetch error:", error);
    return null;
  }
}

/**
 * Serve Farcaster manifest for Mini App registration
 */
function handleManifest(): Response {
  const manifest = {
    accountAssociation: {
      header: "eyJmaWQiOjg1NzMsInR5cGUiOiJhdXRoIiwia2V5IjoiMHgxOEE4NWFkMzQxYjJENkEyYmQ2N2ZiYjEwNEI0ODI3QjkyMmEyQTNjIn0",
      payload: "eyJkb21haW4iOiJhcmJtZS1hcGkuZHlsYW4tMjU5LndvcmtlcnMuZGV2In0",
      signature: "rQ56J0+lbK+gA2hghyDTtflVV0Efqm9/JyqKUn82YLxsvi+ZQLVeXIVErnryST81H8CDl36B/QSyUaJJ8JI59Bs="
    },
    miniapp: {
      version: "1",
      name: "ArbMe",
      iconUrl: "https://arbme.epicdylan.com/arbie.png",
      homeUrl: "https://arbme-api.dylan-259.workers.dev/app",
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
      screenshotUrls: [
        "https://arbme.epicdylan.com/share-image.png"
      ],
      ogTitle: "ArbMe - Permissionless Arb",
      ogDescription: "An ERC20 token that pairs with other tokens to create arb routes. No deals. No permission. Just LP.",
      ogImageUrl: "https://arbme.epicdylan.com/share-image.png"
    }
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Generate frame image (3:2 aspect ratio) with pool stats
 */
async function handleFrameImage(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Fetch current pool data
  let totalTvl = 0;
  let poolCount = 0;

  try {
    const cache = caches.default;
    const cacheKey = new Request(new URL("/pools", request.url).toString());
    const cached = await cache.match(cacheKey);

    if (cached) {
      const data = await cached.json() as { totalTvl: number; poolCount: number };
      totalTvl = data.totalTvl || 0;
      poolCount = data.poolCount || 0;
    }
  } catch {
    // Use defaults
  }

  const tvlText = totalTvl >= 1000 ? `$${(totalTvl / 1000).toFixed(1)}K` : `$${totalTvl.toFixed(0)}`;

  // 3:2 aspect ratio (600x400 for embed)
  const svg = `
    <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0a0a0f"/>
          <stop offset="100%" style="stop-color:#14141f"/>
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#10b981"/>
          <stop offset="100%" style="stop-color:#f59e0b"/>
        </linearGradient>
      </defs>
      <rect width="600" height="400" fill="url(#bg)"/>
      <rect x="0" y="0" width="600" height="4" fill="url(#accent)"/>

      <!-- Title -->
      <text x="300" y="100" text-anchor="middle" fill="#10b981" font-family="monospace" font-size="48" font-weight="bold">$ARBME</text>
      <text x="300" y="140" text-anchor="middle" fill="#7a7a8f" font-family="sans-serif" font-size="18">Decentralized Arbitrage Protocol</text>

      <!-- Stats -->
      <text x="200" y="220" text-anchor="middle" fill="#e8e8f2" font-family="monospace" font-size="36" font-weight="bold">${poolCount}</text>
      <text x="200" y="250" text-anchor="middle" fill="#7a7a8f" font-family="sans-serif" font-size="14">POOLS</text>

      <text x="400" y="220" text-anchor="middle" fill="#10b981" font-family="monospace" font-size="36" font-weight="bold">${tvlText}</text>
      <text x="400" y="250" text-anchor="middle" fill="#7a7a8f" font-family="sans-serif" font-size="14">TOTAL TVL</text>

      <!-- CTA -->
      <rect x="200" y="300" width="200" height="50" rx="4" fill="#10b981"/>
      <text x="300" y="332" text-anchor="middle" fill="#0a0a0f" font-family="monospace" font-size="16" font-weight="bold">View Pools</text>
    </svg>
  `;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Generate OG image (1200x630) for social sharing
 */
async function handleOgImage(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let totalTvl = 0;
  let poolCount = 0;

  try {
    const cache = caches.default;
    const cacheKey = new Request(new URL("/pools", request.url).toString());
    const cached = await cache.match(cacheKey);

    if (cached) {
      const data = await cached.json() as { totalTvl: number; poolCount: number };
      totalTvl = data.totalTvl || 0;
      poolCount = data.poolCount || 0;
    }
  } catch {
    // Use defaults
  }

  const tvlText = totalTvl >= 1000 ? `$${(totalTvl / 1000).toFixed(1)}K` : `$${totalTvl.toFixed(0)}`;

  // 1.91:1 aspect ratio (1200x630)
  const svg = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0a0a0f"/>
          <stop offset="100%" style="stop-color:#14141f"/>
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#10b981"/>
          <stop offset="100%" style="stop-color:#f59e0b"/>
        </linearGradient>
        <radialGradient id="glow1" cx="30%" cy="30%">
          <stop offset="0%" style="stop-color:#10b98140"/>
          <stop offset="100%" style="stop-color:transparent"/>
        </radialGradient>
        <radialGradient id="glow2" cx="70%" cy="70%">
          <stop offset="0%" style="stop-color:#f59e0b35"/>
          <stop offset="100%" style="stop-color:transparent"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <rect width="1200" height="630" fill="url(#glow1)"/>
      <rect width="1200" height="630" fill="url(#glow2)"/>
      <rect x="0" y="0" width="1200" height="6" fill="url(#accent)"/>

      <!-- Title -->
      <text x="600" y="200" text-anchor="middle" fill="url(#accent)" font-family="monospace" font-size="96" font-weight="bold">ArbMe</text>
      <text x="600" y="270" text-anchor="middle" fill="#10b981" font-family="monospace" font-size="24" letter-spacing="8">DECENTRALIZED ARBITRAGE PROTOCOL</text>

      <!-- Stats -->
      <rect x="280" y="340" width="260" height="120" rx="8" fill="#0f0f18" stroke="#1f1f2f"/>
      <text x="410" y="400" text-anchor="middle" fill="#e8e8f2" font-family="monospace" font-size="48" font-weight="bold">${poolCount}</text>
      <text x="410" y="440" text-anchor="middle" fill="#7a7a8f" font-family="sans-serif" font-size="18">Active Pools</text>

      <rect x="660" y="340" width="260" height="120" rx="8" fill="#0f0f18" stroke="#1f1f2f"/>
      <text x="790" y="400" text-anchor="middle" fill="#10b981" font-family="monospace" font-size="48" font-weight="bold">${tvlText}</text>
      <text x="790" y="440" text-anchor="middle" fill="#7a7a8f" font-family="sans-serif" font-size="18">Total TVL</text>

      <!-- Tagline -->
      <text x="600" y="540" text-anchor="middle" fill="#7a7a8f" font-family="sans-serif" font-size="20">LP to earn fees. Arb to profit. Build routes together.</text>

      <!-- Base badge -->
      <text x="600" y="590" text-anchor="middle" fill="#1f1f2f" font-family="monospace" font-size="14">Built on Base</text>
    </svg>
  `;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Generate app icon (1024x1024)
 */
function handleIcon(): Response {
  // Simple icon with ARBME branding
  const svg = `
    <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0a0a0f"/>
          <stop offset="100%" style="stop-color:#14141f"/>
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#10b981"/>
          <stop offset="100%" style="stop-color:#f59e0b"/>
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="200" fill="url(#bg)"/>
      <rect x="80" y="80" width="864" height="864" rx="160" fill="none" stroke="url(#accent)" stroke-width="16"/>

      <!-- Arbie mascot simplified -->
      <rect x="312" y="280" width="400" height="440" rx="80" fill="#10b981"/>
      <rect x="352" y="320" width="320" height="360" rx="60" fill="#0a0a0f"/>

      <!-- Eyes -->
      <circle cx="432" cy="460" r="48" fill="#10b981"/>
      <circle cx="592" cy="460" r="48" fill="#10b981"/>

      <!-- Mouth -->
      <rect x="392" y="560" width="240" height="80" rx="24" fill="#10b981"/>
    </svg>
  `;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Generate favicon (32x32)
 */
function handleFavicon(): Response {
  const svg = `
    <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#0a0a0f"/>
      <rect x="6" y="4" width="20" height="22" rx="4" fill="#10b981"/>
      <rect x="8" y="6" width="16" height="18" rx="3" fill="#0a0a0f"/>
      <circle cx="12" cy="13" r="2.5" fill="#10b981"/>
      <circle cx="20" cy="13" r="2.5" fill="#10b981"/>
      <rect x="10" y="18" width="12" height="4" rx="1.5" fill="#10b981"/>
    </svg>
  `;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Generate splash image (200x200) for Mini App loading screen
 */
function handleSplash(): Response {
  const svg = `
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="#0a0a0f"/>
      <!-- Arbie mascot simplified -->
      <rect x="50" y="40" width="100" height="110" rx="20" fill="#10b981"/>
      <rect x="60" y="50" width="80" height="90" rx="15" fill="#0a0a0f"/>
      <!-- Eyes -->
      <circle cx="85" cy="85" r="12" fill="#10b981"/>
      <circle cx="115" cy="85" r="12" fill="#10b981"/>
      <!-- Mouth -->
      <rect x="75" y="110" width="50" height="20" rx="6" fill="#10b981"/>
      <!-- Text -->
      <text x="100" y="175" text-anchor="middle" fill="#10b981" font-family="monospace" font-size="16" font-weight="bold">ARBME</text>
    </svg>
  `;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Generate screenshot (1284x2778) for app store listing
 */
async function handleScreenshot(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Try to get pool data for screenshot
  let totalTvl = 0;
  let poolCount = 0;
  let pools: { pair: string; dex: string; tvl: number }[] = [];

  try {
    const cache = caches.default;
    const cacheKey = new Request(new URL("/pools", request.url).toString());
    const cached = await cache.match(cacheKey);

    if (cached) {
      const data = await cached.json() as { totalTvl: number; poolCount: number; pools: { pair: string; dex: string; tvl: number }[] };
      totalTvl = data.totalTvl || 0;
      poolCount = data.poolCount || 0;
      pools = data.pools || [];
    }
  } catch {
    // Use defaults
  }

  const tvlText = totalTvl >= 1000 ? `$${(totalTvl / 1000).toFixed(1)}K` : `$${totalTvl.toFixed(0)}`;

  // Generate pool list SVG
  const poolItems = pools.slice(0, 4).map((p, i) => {
    const y = 1200 + (i * 220);
    const tvl = p.tvl >= 1000 ? `$${(p.tvl / 1000).toFixed(1)}K` : `$${p.tvl.toFixed(0)}`;
    return `
      <rect x="80" y="${y}" width="1124" height="180" rx="24" fill="#0f0f18" stroke="#1f1f2f" stroke-width="2"/>
      <text x="140" y="${y + 80}" fill="#e8e8f2" font-family="monospace" font-size="48" font-weight="600">${p.pair}</text>
      <text x="140" y="${y + 130}" fill="#7a7a8f" font-family="sans-serif" font-size="36">${p.dex}</text>
      <text x="1124" y="${y + 100}" text-anchor="end" fill="#10b981" font-family="monospace" font-size="52" font-weight="bold">${tvl}</text>
    `;
  }).join('');

  // 1284x2778 portrait screenshot
  const svg = `
    <svg width="1284" height="2778" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0a0a0f"/>
          <stop offset="100%" style="stop-color:#14141f"/>
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#10b981"/>
          <stop offset="100%" style="stop-color:#f59e0b"/>
        </linearGradient>
      </defs>
      <rect width="1284" height="2778" fill="url(#bg)"/>

      <!-- Header -->
      <text x="642" y="200" text-anchor="middle" fill="url(#accent)" font-family="monospace" font-size="96" font-weight="bold">$ARBME</text>
      <text x="642" y="280" text-anchor="middle" fill="#7a7a8f" font-family="sans-serif" font-size="40">Decentralized Arbitrage Protocol</text>

      <!-- Stats -->
      <rect x="80" y="400" width="520" height="200" rx="24" fill="#0f0f18" stroke="#1f1f2f" stroke-width="2"/>
      <text x="340" y="520" text-anchor="middle" fill="#e8e8f2" font-family="monospace" font-size="72" font-weight="bold">${poolCount}</text>
      <text x="340" y="580" text-anchor="middle" fill="#7a7a8f" font-family="sans-serif" font-size="32" text-transform="uppercase">Pools</text>

      <rect x="684" y="400" width="520" height="200" rx="24" fill="#0f0f18" stroke="#1f1f2f" stroke-width="2"/>
      <text x="944" y="520" text-anchor="middle" fill="#10b981" font-family="monospace" font-size="72" font-weight="bold">${tvlText}</text>
      <text x="944" y="580" text-anchor="middle" fill="#7a7a8f" font-family="sans-serif" font-size="32" text-transform="uppercase">Total TVL</text>

      <!-- Section label -->
      <text x="80" y="780" fill="#10b981" font-family="monospace" font-size="28" text-transform="uppercase" letter-spacing="4">Live Pools</text>
      <rect x="80" y="820" width="1124" height="4" fill="url(#accent)"/>

      <!-- Pools list -->
      <text x="80" y="1100" fill="#7a7a8f" font-family="sans-serif" font-size="32">Pool</text>
      <text x="1124" y="1100" text-anchor="end" fill="#7a7a8f" font-family="sans-serif" font-size="32">TVL</text>
      ${poolItems}

      <!-- CTA Button -->
      <rect x="80" y="2400" width="1124" height="140" rx="20" fill="#10b981"/>
      <text x="642" y="2490" text-anchor="middle" fill="#0a0a0f" font-family="monospace" font-size="48" font-weight="bold">Buy $ARBME</text>

      <!-- Footer -->
      <text x="642" y="2680" text-anchor="middle" fill="#1f1f2f" font-family="monospace" font-size="28">Built on Base</text>
    </svg>
  `;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Mini App entry point - serves a simple pool viewer
 */
async function handleMiniApp(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ArbMe - Pool Viewer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0f;
      color: #e8e8f2;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      padding: 1rem;
      padding-top: env(safe-area-inset-top, 0px);
      padding-bottom: 2rem;
    }
    .header {
      text-align: center;
      padding: 0.5rem 0 1rem;
      border-bottom: 1px solid #1f1f2f;
      margin-bottom: 1rem;
    }
    .logo-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    .logo-icon {
      width: 36px;
      height: 36px;
    }
    .logo {
      font-family: monospace;
      font-size: 1.75rem;
      font-weight: bold;
      background: linear-gradient(135deg, #10b981, #f59e0b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .price {
      font-family: monospace;
      font-size: 1.25rem;
      color: #10b981;
      margin-top: 0.25rem;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .stat {
      text-align: center;
      background: #0f0f18;
      padding: 0.75rem 0.5rem;
      border: 1px solid #1f1f2f;
    }
    .stat-value {
      font-family: monospace;
      font-size: 1.1rem;
      font-weight: bold;
      color: #10b981;
    }
    .stat-label {
      font-size: 0.65rem;
      color: #7a7a8f;
      text-transform: uppercase;
      margin-top: 0.25rem;
    }
    .section-label {
      font-family: monospace;
      font-size: 0.7rem;
      color: #10b981;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 0.5rem;
    }
    .pools {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .pool {
      background: #0f0f18;
      border: 1px solid #1f1f2f;
      padding: 0.75rem;
    }
    .pool-top {
      display: flex;
      align-items: flex-start;
      margin-bottom: 0.5rem;
    }
    .pool-name {
      font-family: monospace;
      font-weight: 600;
      font-size: 0.95rem;
    }
    .pool-dex {
      font-size: 0.7rem;
      color: #7a7a8f;
    }
    .pool-stats {
      display: flex;
      gap: 1rem;
    }
    .pool-stat {
      display: flex;
      flex-direction: column;
    }
    .pool-stat-label {
      font-size: 0.6rem;
      color: #7a7a8f;
      text-transform: uppercase;
    }
    .pool-stat-value {
      font-family: monospace;
      font-size: 0.85rem;
      color: #e8e8f2;
    }
    .pool-stat-value.tvl {
      color: #10b981;
      font-weight: bold;
    }
    .pool-address {
      font-family: monospace;
      font-size: 0.65rem;
      color: #7a7a8f;
      margin-top: 0.5rem;
      word-break: break-all;
      cursor: pointer;
    }
    .pool-address:active {
      color: #10b981;
    }
    .pool-price {
      font-family: monospace;
      font-size: 0.75rem;
      color: #f59e0b;
      margin-top: 0.25rem;
    }
    .pool-icons {
      display: flex;
      gap: 0.25rem;
      margin-right: 0.5rem;
    }
    .pool-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #1f1f2f;
    }
    .loading {
      text-align: center;
      padding: 2rem;
      color: #7a7a8f;
    }
    .buttons {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .btn {
      display: block;
      width: 100%;
      text-align: center;
      padding: 0.875rem;
      border: none;
      font-family: monospace;
      font-weight: bold;
      font-size: 0.9rem;
      cursor: pointer;
      text-decoration: none;
    }
    .btn-primary {
      background: #10b981;
      color: #0a0a0f;
    }
    .btn-secondary {
      background: transparent;
      color: #e8e8f2;
      border: 1px solid #1f1f2f;
    }
    .btn:active {
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-row">
      <svg class="logo-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="6" fill="#0a0a0f"/>
        <rect x="6" y="4" width="20" height="22" rx="4" fill="#10b981"/>
        <rect x="8" y="6" width="16" height="18" rx="3" fill="#0a0a0f"/>
        <circle cx="12" cy="13" r="2.5" fill="#10b981"/>
        <circle cx="20" cy="13" r="2.5" fill="#10b981"/>
        <rect x="10" y="18" width="12" height="4" rx="1.5" fill="#10b981"/>
      </svg>
      <div class="logo">$ARBME</div>
    </div>
    <div class="price" id="price">-</div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-value" id="pool-count">-</div>
      <div class="stat-label">Pools</div>
    </div>
    <div class="stat">
      <div class="stat-value" id="total-tvl">-</div>
      <div class="stat-label">TVL</div>
    </div>
    <div class="stat">
      <div class="stat-value" id="total-vol">-</div>
      <div class="stat-label">24h Vol</div>
    </div>
  </div>

  <div class="section-label">Live Pools</div>
  <div class="pools" id="pools">
    <div class="loading">Loading pools...</div>
  </div>

  <div class="buttons">
    <button class="btn btn-primary" id="buy-btn">Buy $ARBME</button>
    <a href="https://arbme.epicdylan.com" target="_blank" class="btn btn-secondary">Learn More</a>
  </div>

  <script type="module">
    import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk';

    function formatUsd(val) {
      if (val >= 1000000) return '$' + (val / 1000000).toFixed(2) + 'M';
      if (val >= 1000) return '$' + (val / 1000).toFixed(1) + 'K';
      if (val >= 1) return '$' + val.toFixed(2);
      return '$' + val.toFixed(4);
    }

    function formatPrice(val) {
      const num = parseFloat(val);
      if (num >= 1) return '$' + num.toFixed(4);
      if (num >= 0.0001) return '$' + num.toFixed(6);
      return '$' + num.toFixed(10);
    }

    // Token colors for icons
    const TOKEN_COLORS = {
      'ARBME': '#10b981',
      'WETH': '#627eea',
      'ETH': '#627eea',
      'USDC': '#2775ca',
      'PAGE': '#ff6b35',
      'OINC': '#ff69b4',
      'cbBTC': '#f7931a',
      'BTC': '#f7931a',
      'CLANKER': '#8b5cf6',
    };

    function getTokenColor(symbol) {
      const upper = symbol.toUpperCase();
      for (const [key, color] of Object.entries(TOKEN_COLORS)) {
        if (upper.includes(key)) return color;
      }
      return '#7a7a8f';
    }

    function tokenIcon(symbol) {
      const color = getTokenColor(symbol);
      const letter = symbol.charAt(0).toUpperCase();
      return \`<svg class="pool-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="\${color}"/><text x="12" y="16" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold">\${letter}</text></svg>\`;
    }

    async function loadPools() {
      try {
        const res = await fetch('/pools');
        const data = await res.json();

        // Price
        document.getElementById('price').textContent = formatPrice(data.arbmePrice);

        // Stats
        document.getElementById('pool-count').textContent = data.poolCount;
        document.getElementById('total-tvl').textContent = formatUsd(data.totalTvl);

        const totalVol = data.pools.reduce((sum, p) => sum + (p.volume24h || 0), 0);
        document.getElementById('total-vol').textContent = formatUsd(totalVol);

        // Pools
        const poolsEl = document.getElementById('pools');
        poolsEl.innerHTML = data.pools.map(p => {
          const addr = p.pairAddress || '';
          const shortAddr = addr.length > 20 ? addr.slice(0, 10) + '...' + addr.slice(-8) : addr;
          const tokens = p.pair.split(/\\s*\\/\\s*/);
          const token0 = tokens[0] || '?';
          const token1 = tokens[1] || '?';
          return \`
          <div class="pool">
            <div class="pool-top">
              <div class="pool-icons">
                \${tokenIcon(token0)}
                \${tokenIcon(token1)}
              </div>
              <div style="flex:1">
                <div class="pool-name">\${p.pair}</div>
                <div class="pool-dex">\${p.dex}</div>
                \${p.priceUsd ? \`<div class="pool-price">ARBME: \${formatPrice(p.priceUsd)}</div>\` : ''}
              </div>
            </div>
            <div class="pool-stats">
              <div class="pool-stat">
                <div class="pool-stat-label">TVL</div>
                <div class="pool-stat-value tvl">\${formatUsd(p.tvl)}</div>
              </div>
              <div class="pool-stat">
                <div class="pool-stat-label">24h Vol</div>
                <div class="pool-stat-value">\${formatUsd(p.volume24h || 0)}</div>
              </div>
            </div>
            \${addr ? \`<div class="pool-address" onclick="copyAddress('\${addr}')" title="Tap to copy">\${shortAddr}</div>\` : ''}
          </div>
        \`}).join('');
      } catch (e) {
        document.getElementById('pools').innerHTML = '<div class="loading">Failed to load pools</div>';
      }
    }

    // ARBME token address on Base
    const ARBME_ADDRESS = '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07';

    // Copy address to clipboard
    window.copyAddress = async function(addr) {
      try {
        await navigator.clipboard.writeText(addr);
        // Brief visual feedback
        event.target.style.color = '#10b981';
        setTimeout(() => { event.target.style.color = ''; }, 500);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    };

    // Handle buy button click - opens native swap widget
    document.getElementById('buy-btn').addEventListener('click', async () => {
      try {
        await sdk.actions.swapToken({
          buyToken: ARBME_ADDRESS
        });
      } catch (e) {
        console.error('Swap failed:', e);
        // Fallback to Uniswap URL if swap action fails
        window.open('https://app.uniswap.org/swap?outputCurrency=' + ARBME_ADDRESS + '&chain=base', '_blank');
      }
    });

    // Load pools then signal ready to Farcaster
    async function init() {
      try {
        await loadPools();
      } catch (e) {
        console.error('Failed to load pools:', e);
      }
      // Always call ready so app doesn't hang on splash screen
      await sdk.actions.ready();
    }
    init();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      ...CORS_HEADERS,
    },
  });
}

function jsonResponse(
  data: unknown,
  extraHeaders: Record<string, string> = {},
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}
