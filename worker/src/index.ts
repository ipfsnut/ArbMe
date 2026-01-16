/**
 * ArbMe API Worker
 * Uses GeckoTerminal API for pool data, with RPC fallback for unlisted pools
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

// GeckoTerminal API
const GECKO_API = "https://api.geckoterminal.com/api/v2";

// Base RPC for fallback queries
const BASE_RPC = "https://mainnet.base.org";

// Known pools that may not be indexed on GeckoTerminal
// These are queried directly via RPC as fallback
const FALLBACK_POOLS = [
  {
    name: "PAGE/ARBME",
    type: "uniswap-v2" as const,
    poolAddress: "0x11FD4947bE07E721B57622df3ef1E1C773ED5655",
    token0: "0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE", // PAGE
    token1: ARBME.address, // ARBME
    token0Decimals: 8,
    token1Decimals: 18,
    token0Symbol: "PAGE",
    dex: "Uniswap V2",
  },
  {
    name: "ARBME/OINC",
    type: "uniswap-v4" as const,
    poolAddress: "0x498581ff718922c3f8e6a244956af099b2652b2b", // PoolManager
    token0: ARBME.address,
    token1: "0x59e058780dd8a6017061596a62288b6438edbe68", // OINC
    token0Decimals: 18,
    token1Decimals: 18,
    token0Symbol: "ARBME",
    token1Symbol: "OINC",
    dex: "Uniswap V4",
    // Would need poolId for proper V4 queries - for now just show as listed
  },
];

// Function selectors
const GET_RESERVES = "0x0902f1ac"; // getReserves()

interface GeckoPoolData {
  id: string;
  attributes: {
    address: string;
    name: string;
    base_token_price_usd: string;
    quote_token_price_usd: string;
    reserve_in_usd: string;
    price_change_percentage: {
      h24: string;
    };
    volume_usd: {
      h24: string;
    };
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
    // Fetch from GeckoTerminal
    const geckoPools = await fetchGeckoTerminalPools();

    // Fetch fallback pools via RPC (for pools not indexed on GeckoTerminal)
    const fallbackPools = await fetchFallbackPools(geckoPools);

    // Combine and sort by TVL
    const allPools = [...geckoPools, ...fallbackPools];
    allPools.sort((a, b) => b.tvl - a.tvl);

    const totalTvl = allPools.reduce((sum, p) => sum + p.tvl, 0);

    // Get ARBME price from highest TVL pool
    const arbmePrice = allPools.length > 0 ? allPools[0].priceUsd : "0";

    const responseData = {
      token: ARBME.address,
      poolCount: allPools.length,
      totalTvl,
      arbmePrice,
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
    const msg = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: "Failed to fetch pools", details: msg }, {}, 500);
  }
}

async function fetchGeckoTerminalPools(): Promise<PoolData[]> {
  try {
    const response = await fetch(
      `${GECKO_API}/networks/base/tokens/${ARBME.address.toLowerCase()}/pools?page=1`,
      {
        headers: { Accept: "application/json" },
      }
    );

    if (!response.ok) {
      console.error(`GeckoTerminal API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as { data: GeckoPoolData[] };

    if (!data.data || data.data.length === 0) {
      return [];
    }

    const pools: PoolData[] = [];

    for (const pool of data.data) {
      const attrs = pool.attributes;
      const tvl = parseFloat(attrs.reserve_in_usd) || 0;
      const volume24h = parseFloat(attrs.volume_usd?.h24) || 0;
      const priceChange24h = parseFloat(attrs.price_change_percentage?.h24) || 0;

      // Determine which token is ARBME
      const baseTokenId = pool.relationships.base_token.data.id;
      const isArbmeBase = baseTokenId.toLowerCase().includes(ARBME.address.toLowerCase());

      const arbmePrice = isArbmeBase
        ? attrs.base_token_price_usd
        : attrs.quote_token_price_usd;

      // Parse pool name to get pair name
      const poolName = attrs.name.split(" ").slice(0, 3).join(" ").replace("%", "").trim();

      // Get DEX name from relationship
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
        url: `https://www.geckoterminal.com/base/pools/${attrs.address}`,
        source: "geckoterminal",
      });
    }

    return pools;

  } catch (error) {
    console.error("Error fetching GeckoTerminal data:", error);
    return [];
  }
}

async function fetchFallbackPools(existingPools: PoolData[]): Promise<PoolData[]> {
  const pools: PoolData[] = [];

  // Get existing pool addresses to avoid duplicates
  const existingAddresses = new Set(
    existingPools.map(p => p.pairAddress.toLowerCase())
  );

  for (const config of FALLBACK_POOLS) {
    // Skip if already fetched from GeckoTerminal
    if (existingAddresses.has(config.poolAddress.toLowerCase())) {
      continue;
    }

    try {
      if (config.type === "uniswap-v2") {
        const poolData = await fetchV2Pool(config);
        if (poolData) {
          pools.push(poolData);
        }
      } else if (config.type === "uniswap-v4") {
        // V4 pools without poolId can only be listed, not queried for TVL
        // For now, add with 0 TVL to show they exist
        pools.push({
          pair: config.name,
          pairAddress: config.poolAddress,
          dex: config.dex,
          tvl: 0,
          volume24h: 0,
          priceUsd: "0",
          priceChange24h: 0,
          url: `https://dexscreener.com/base/${ARBME.address}`,
          source: "config",
        });
      }
    } catch (error) {
      console.error(`Error fetching fallback pool ${config.name}:`, error);
    }
  }

  return pools;
}

async function fetchV2Pool(config: typeof FALLBACK_POOLS[0]): Promise<PoolData | null> {
  try {
    const response = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: config.poolAddress, data: GET_RESERVES }, "latest"],
        id: 1,
      }),
    });

    const json = await response.json() as { result?: string };
    if (!json.result || json.result === "0x" || json.result.length < 130) {
      return null;
    }

    const hex = json.result.slice(2);
    const reserve0 = Number(BigInt("0x" + hex.slice(0, 64)));
    const reserve1 = Number(BigInt("0x" + hex.slice(64, 128)));

    const token0Amount = reserve0 / Math.pow(10, config.token0Decimals);
    const token1Amount = reserve1 / Math.pow(10, config.token1Decimals);

    // For PAGE/ARBME, PAGE is token0, ARBME is token1
    // We can't calculate USD TVL without price, but we can show the reserves
    // Estimate TVL as 0 since we don't have reliable price data

    return {
      pair: config.name,
      pairAddress: config.poolAddress,
      dex: config.dex,
      tvl: 0, // Would need PAGE price to calculate
      volume24h: 0,
      priceUsd: "0",
      priceChange24h: 0,
      url: `https://dexscreener.com/base/${config.poolAddress}`,
      source: "rpc",
    };

  } catch (error) {
    console.error(`Error fetching V2 pool ${config.poolAddress}:`, error);
    return null;
  }
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
