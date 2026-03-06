/**
 * Token Pricing Service
 *
 * Primary: On-chain V4 pool reads (sqrtPriceX96 from StateView)
 * Fallback: GeckoTerminal batch price API
 *
 * GeckoTerminal is still used for:
 * - WETH/USD price (no on-chain USD oracle)
 * - Tokens without known V4 WETH pools
 * - Fallback when RPC calls fail
 *
 * Pool discovery (volume, 24h%, DEX names, TVL) stays in pools.ts.
 */

import {
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
} from 'viem';

import {
  ARBME,
  TOKENS,
  BASE_RPCS_FALLBACK,
  RPC_TIMEOUT,
} from './constants.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface CachedPrice {
  price: number;
  timestamp: number;
  source: 'gecko' | 'onchain';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const GECKO_API = 'https://api.geckoterminal.com/api/v2';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

// V4 StateView contract on Base mainnet
const V4_STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';

// Clanker V2 hook — used by ARBME, CHAOS, RATCHET WETH pools
const CLANKER_HOOK_V2 = '0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC';
const CLANKER_FEE = 8388608; // 0x800000 — dynamic fee flag
const CLANKER_TICK_SPACING = 200;

// V4 WETH pool configs for on-chain pricing
// All use Clanker V2 hooks with dynamic fee + tickSpacing 200
interface V4PoolConfig {
  token: string;
  decimals: number;
}

const V4_WETH_POOLS: V4PoolConfig[] = [
  { token: ARBME.address, decimals: 18 },
  { token: TOKENS.CHAOS, decimals: 18 },
  { token: TOKENS.RATCHET, decimals: 18 },
];

// Set of tokens that have known V4 WETH pools for fast lookup
const V4_WETH_POOL_TOKENS = new Set(
  V4_WETH_POOLS.map(p => p.token.toLowerCase())
);

// Cache TTL in milliseconds
const CACHE_TTL = 5 * 60_000; // 5 minutes — stale prices beat $0 prices

// ═══════════════════════════════════════════════════════════════════════════════
// Price Cache
// ═══════════════════════════════════════════════════════════════════════════════

const priceCache = new Map<string, CachedPrice>();

function getCachedPrice(address: string): number | null {
  const normalized = address.toLowerCase();
  const cached = priceCache.get(normalized);

  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL) {
    return null; // Stale, but don't delete — getStaleCachedPrice needs it
  }

  return cached.price;
}

/** Return price even if stale (last resort fallback) */
function getStaleCachedPrice(address: string): number | null {
  const cached = priceCache.get(address.toLowerCase());
  return cached ? cached.price : null;
}

function setCachedPrice(address: string, price: number, source: 'gecko' | 'onchain'): void {
  priceCache.set(address.toLowerCase(), {
    price,
    timestamp: Date.now(),
    source,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RPC Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function getBaseRpcs(alchemyKey?: string): string[] {
  const rpcs: string[] = [];
  if (alchemyKey) {
    rpcs.push(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`);
  }
  rpcs.push(...BASE_RPCS_FALLBACK);
  return rpcs;
}

async function rpcCall(
  to: string,
  data: string,
  alchemyKey?: string
): Promise<string | null> {
  const rpcs = getBaseRpcs(alchemyKey);

  for (const rpc of rpcs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT);

      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to, data }, 'latest'],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) continue;

      const json = await response.json() as { result?: string };
      if (json.result && json.result !== '0x') {
        return json.result;
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// On-Chain V4 Pricing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute V4 poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 * Tokens must be sorted (currency0 < currency1).
 */
function computePoolId(
  currency0: string,
  currency1: string,
  fee: number,
  tickSpacing: number,
  hooks: string,
): string {
  const encoded = encodeAbiParameters(
    parseAbiParameters('address, address, uint24, int24, address'),
    [currency0 as `0x${string}`, currency1 as `0x${string}`, fee, tickSpacing, hooks as `0x${string}`],
  );
  return keccak256(encoded);
}

/**
 * getSlot0 selector + poolId encoding for StateView
 * StateView.getSlot0(bytes32 poolId) returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)
 */
function encodeGetSlot0(poolId: string): string {
  // function selector for getSlot0(bytes32)
  const selector = '0x3b5349b2'; // keccak256("getSlot0(bytes32)") first 4 bytes
  // pad poolId to 32 bytes (remove 0x prefix, should already be 64 hex chars)
  const id = poolId.startsWith('0x') ? poolId.slice(2) : poolId;
  return selector + id.padStart(64, '0');
}

/**
 * Decode sqrtPriceX96 → price of token in WETH terms.
 *
 * sqrtPriceX96 encodes: sqrt(token1/token0) * 2^96
 * If token < WETH (token is currency0): price_token_in_weth = (sqrtPriceX96 / 2^96)^2
 * If token > WETH (token is currency1): price_token_in_weth = 1 / (sqrtPriceX96 / 2^96)^2
 *
 * Both tokens are 18 decimals so no decimal adjustment needed.
 */
function sqrtPriceX96ToTokenPrice(
  sqrtPriceX96: bigint,
  tokenAddress: string,
): number {
  if (sqrtPriceX96 === 0n) return 0;

  const token = tokenAddress.toLowerCase();
  const weth = WETH_ADDRESS.toLowerCase();

  // Sort: currency0 is the smaller address
  const tokenIsZero = token < weth;

  // price = (sqrtPriceX96 / 2^96)^2 = sqrtPriceX96^2 / 2^192
  // This gives token1/token0 ratio
  const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
  const priceRatio = sqrtPrice * sqrtPrice; // token1 per token0

  if (tokenIsZero) {
    // token is currency0, WETH is currency1
    // priceRatio = WETH per token → that's what we want (token price in WETH)
    return priceRatio;
  } else {
    // WETH is currency0, token is currency1
    // priceRatio = token per WETH → invert to get WETH per token
    return priceRatio > 0 ? 1 / priceRatio : 0;
  }
}

/**
 * Fetch on-chain price for a token with a known V4 WETH pool.
 * Returns USD price (priceInWeth * wethPrice).
 */
async function fetchOnChainPriceV4(
  tokenAddress: string,
  wethPrice: number,
  alchemyKey?: string,
): Promise<number> {
  const token = tokenAddress.toLowerCase();
  const weth = WETH_ADDRESS.toLowerCase();

  // Sort tokens for pool key
  const currency0 = token < weth ? token : weth;
  const currency1 = token < weth ? weth : token;

  const poolId = computePoolId(
    currency0,
    currency1,
    CLANKER_FEE,
    CLANKER_TICK_SPACING,
    CLANKER_HOOK_V2,
  );

  const calldata = encodeGetSlot0(poolId);
  const result = await rpcCall(V4_STATE_VIEW, calldata, alchemyKey);

  if (!result || result === '0x' || result.length < 66) {
    return 0;
  }

  // Decode: first 32 bytes = sqrtPriceX96 (uint160, right-aligned in 32 bytes)
  const sqrtPriceX96 = BigInt('0x' + result.slice(2, 66));
  if (sqrtPriceX96 === 0n) return 0;

  const priceInWeth = sqrtPriceX96ToTokenPrice(sqrtPriceX96, tokenAddress);
  return priceInWeth * wethPrice;
}

/**
 * Batch fetch on-chain V4 prices for multiple tokens.
 * Only works for tokens in V4_WETH_POOL_TOKENS.
 */
async function fetchOnChainPricesV4(
  tokenAddresses: string[],
  wethPrice: number,
  alchemyKey?: string,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  const v4Tokens = tokenAddresses.filter(a => V4_WETH_POOL_TOKENS.has(a.toLowerCase()));
  if (v4Tokens.length === 0 || wethPrice <= 0) return prices;

  const results = await Promise.all(
    v4Tokens.map(async (addr) => {
      const price = await fetchOnChainPriceV4(addr, wethPrice, alchemyKey);
      return { addr: addr.toLowerCase(), price };
    })
  );

  for (const { addr, price } of results) {
    if (price > 0) {
      prices.set(addr, price);
    }
  }

  return prices;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GeckoTerminal API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch prices from GeckoTerminal (batch)
 */
async function fetchGeckoPricesBatch(addresses: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  if (addresses.length === 0) return prices;

  try {
    const addressList = addresses.join(',');
    const url = `${GECKO_API}/simple/networks/base/token_price/${addressList}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[Pricing] GeckoTerminal returned ${response.status}`);
      return prices;
    }

    const data = await response.json() as any;
    const tokenPrices = data?.data?.attributes?.token_prices || {};

    for (const [addr, price] of Object.entries(tokenPrices)) {
      if (price && typeof price === 'string') {
        const priceNum = parseFloat(price);
        if (priceNum > 0 && isFinite(priceNum)) {
          prices.set(addr.toLowerCase(), priceNum);
        }
      }
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.warn(`[Pricing] GeckoTerminal timed out after 10s for ${addresses.length} tokens`);
    } else {
      console.error('[Pricing] GeckoTerminal fetch failed:', error);
    }
  }

  return prices;
}

const GECKO_BATCH_SIZE = 30;

async function fetchGeckoPrices(addresses: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  if (addresses.length === 0) return prices;

  // Chunk into batches to avoid URL length limits
  const batches: string[][] = [];
  for (let i = 0; i < addresses.length; i += GECKO_BATCH_SIZE) {
    batches.push(addresses.slice(i, i + GECKO_BATCH_SIZE));
  }

  // Fetch all batches in parallel
  const results = await Promise.all(batches.map(batch => fetchGeckoPricesBatch(batch)));

  for (const batchPrices of results) {
    for (const [addr, price] of batchPrices) {
      prices.set(addr, price);
    }
  }

  console.log(`[Pricing] GeckoTerminal returned ${prices.size}/${addresses.length} prices`);
  return prices;
}

/**
 * Fetch single price from GeckoTerminal
 */
async function fetchGeckoPrice(address: string): Promise<number> {
  const prices = await fetchGeckoPrices([address]);
  return prices.get(address.toLowerCase()) || 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get price for a single token.
 * Priority: cache → on-chain V4 → GeckoTerminal → stale cache
 */
export async function getTokenPrice(
  tokenAddress: string,
  alchemyKey?: string
): Promise<number> {
  const normalized = tokenAddress.toLowerCase();

  // 1. Check fresh cache
  const cached = getCachedPrice(normalized);
  if (cached !== null) {
    return cached;
  }

  // 2. Try on-chain V4 if this token has a known WETH pool
  if (V4_WETH_POOL_TOKENS.has(normalized)) {
    // Need WETH price first (from cache or Gecko)
    let wethPrice = getCachedPrice(WETH_ADDRESS);
    if (wethPrice === null) {
      wethPrice = await fetchGeckoPrice(WETH_ADDRESS);
      if (wethPrice > 0) {
        setCachedPrice(WETH_ADDRESS, wethPrice, 'gecko');
      }
    }

    if (wethPrice && wethPrice > 0) {
      const onChainPrice = await fetchOnChainPriceV4(normalized, wethPrice, alchemyKey);
      if (onChainPrice > 0) {
        setCachedPrice(normalized, onChainPrice, 'onchain');
        return onChainPrice;
      }
    }
  }

  // 3. Fallback to GeckoTerminal
  const price = await fetchGeckoPrice(normalized);
  if (price > 0) {
    setCachedPrice(normalized, price, 'gecko');
    return price;
  }

  // 4. Return stale cache as last resort
  const stale = getStaleCachedPrice(normalized);
  if (stale !== null) {
    console.warn(`[Pricing] Returning stale price for ${normalized.slice(0, 10)}...`);
    return stale;
  }

  return 0;
}

/**
 * Get prices for multiple tokens (batched, cached).
 * Priority: cache → on-chain V4 → GeckoTerminal batch → stale cache
 */
export async function getTokenPrices(
  tokenAddresses: string[],
  alchemyKey?: string
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  const uncached: string[] = [];

  // 1. Check fresh cache
  for (const addr of tokenAddresses) {
    const normalized = addr.toLowerCase();
    const cached = getCachedPrice(normalized);
    if (cached !== null) {
      results.set(normalized, cached);
    } else {
      uncached.push(normalized);
    }
  }

  if (uncached.length === 0) {
    console.log(`[Pricing] All ${tokenAddresses.length} prices served from cache`);
    return results;
  }

  console.log(`[Pricing] ${results.size} cached, ${uncached.length} to fetch`);

  // 2. Try on-chain V4 for tokens with known WETH pools
  const v4Candidates = uncached.filter(a => V4_WETH_POOL_TOKENS.has(a));
  if (v4Candidates.length > 0) {
    // Get WETH price (needed for on-chain conversion)
    let wethPrice = getCachedPrice(WETH_ADDRESS) ?? results.get(WETH_ADDRESS) ?? null;
    if (wethPrice === null) {
      wethPrice = await fetchGeckoPrice(WETH_ADDRESS);
      if (wethPrice > 0) {
        setCachedPrice(WETH_ADDRESS, wethPrice, 'gecko');
        // Also add to results if WETH was requested
        if (uncached.includes(WETH_ADDRESS)) {
          results.set(WETH_ADDRESS, wethPrice);
        }
      }
    }

    if (wethPrice && wethPrice > 0) {
      const v4Prices = await fetchOnChainPricesV4(v4Candidates, wethPrice, alchemyKey);
      for (const [addr, price] of v4Prices) {
        setCachedPrice(addr, price, 'onchain');
        results.set(addr, price);
      }
      console.log(`[Pricing] On-chain V4 returned ${v4Prices.size}/${v4Candidates.length} prices`);
    }
  }

  // 3. GeckoTerminal fallback for remaining uncached tokens
  const stillMissing = uncached.filter(addr => !results.has(addr));
  if (stillMissing.length > 0) {
    const geckoPrices = await fetchGeckoPrices(stillMissing);
    for (const [addr, price] of geckoPrices) {
      setCachedPrice(addr, price, 'gecko');
      results.set(addr, price);
    }
  }

  // 4. Stale cache as last resort for anything still missing
  const finalMissing = uncached.filter(addr => !results.has(addr));
  for (const addr of finalMissing) {
    const stale = getStaleCachedPrice(addr);
    if (stale !== null) {
      console.warn(`[Pricing] Using stale price for ${addr.slice(0, 10)}...`);
      results.set(addr, stale);
    }
  }

  console.log(`[Pricing] Returning ${results.size}/${tokenAddresses.length} prices`);
  return results;
}

/**
 * Get WETH price in USD
 */
export async function getWethPrice(): Promise<number> {
  const cached = getCachedPrice(WETH_ADDRESS);
  if (cached !== null) return cached;

  const price = await fetchGeckoPrice(WETH_ADDRESS);
  if (price > 0) {
    setCachedPrice(WETH_ADDRESS, price, 'gecko');
  }
  return price;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Core Prices (for stats banner / AppHeader)
// ═══════════════════════════════════════════════════════════════════════════════

interface CorePricesResult {
  arbmePrice: string;
  chaosPrice: string;
  ratchetPrice: string;
  arbmeTvl: number;
  chaosTvl: number;
  ratchetTvl: number;
  totalTvl: number;
  lastUpdated: string;
}

// Separate cache for the full getCorePrices result
let corePricesCache: { data: CorePricesResult; timestamp: number } | null = null;
const CORE_PRICES_TTL = 2 * 60_000; // 2 minutes

/**
 * Get prices + TVL for the three core tokens (ARBME, CHAOS, RATCHET).
 * Prices come from on-chain V4 (primary) or GeckoTerminal (fallback).
 * TVL comes from fetchPoolsForToken cache (GeckoTerminal — needed for concentrated liquidity TVL).
 */
export async function getCorePrices(alchemyKey?: string): Promise<CorePricesResult> {
  // Check result-level cache
  if (corePricesCache && Date.now() - corePricesCache.timestamp < CORE_PRICES_TTL) {
    return corePricesCache.data;
  }

  // Fetch prices for all three core tokens + WETH
  const priceMap = await getTokenPrices(
    [ARBME.address, TOKENS.CHAOSLP, TOKENS.RATCHET],
    alchemyKey,
  );

  const arbmePrice = priceMap.get(ARBME.address.toLowerCase()) || 0;
  const chaosPrice = priceMap.get(TOKENS.CHAOSLP.toLowerCase()) || 0;
  const ratchetPrice = priceMap.get(TOKENS.RATCHET.toLowerCase()) || 0;

  // TVL: try to read from fetchPoolsForToken cache (lazy import to avoid circular deps)
  let arbmeTvl = 0;
  let chaosTvl = 0;
  let ratchetTvl = 0;

  try {
    const { fetchPoolsForToken } = await import('./pools.js');

    // fetchPoolsForToken has its own 2min cache — if warm, this is instant
    const [arbmePools, chaosPools, ratchetPools] = await Promise.all([
      fetchPoolsForToken(ARBME.address, alchemyKey),
      fetchPoolsForToken(TOKENS.CHAOSLP),
      fetchPoolsForToken(TOKENS.RATCHET),
    ]);

    arbmeTvl = arbmePools.tvl;
    chaosTvl = chaosPools.tvl;
    ratchetTvl = ratchetPools.tvl;
  } catch (error) {
    console.warn('[Pricing] Could not fetch TVL data:', error);
  }

  const result: CorePricesResult = {
    arbmePrice: arbmePrice.toString(),
    chaosPrice: chaosPrice.toString(),
    ratchetPrice: ratchetPrice.toString(),
    arbmeTvl,
    chaosTvl,
    ratchetTvl,
    totalTvl: arbmeTvl + chaosTvl + ratchetTvl,
    lastUpdated: new Date().toISOString(),
  };

  corePricesCache = { data: result, timestamp: Date.now() };
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cache Management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clear the price cache (useful for testing)
 */
export function clearPriceCache(): void {
  priceCache.clear();
  corePricesCache = null;
}

/**
 * Get cache stats (useful for debugging)
 */
export function getPriceCacheStats(): { size: number; entries: Array<{ address: string; price: number; age: number; source: string }> } {
  const now = Date.now();
  const entries = Array.from(priceCache.entries()).map(([address, cached]) => ({
    address,
    price: cached.price,
    age: Math.round((now - cached.timestamp) / 1000),
    source: cached.source,
  }));

  return { size: priceCache.size, entries };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy exports (for backwards compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

export async function getTokenPricesOnChain(
  tokens: Array<{ address: string; decimals: number }>,
  alchemyKey?: string
): Promise<Map<string, number>> {
  const addresses = tokens.map(t => t.address);
  return getTokenPrices(addresses, alchemyKey);
}

export async function getTokenPriceOnChain(
  tokenAddress: string,
  _decimals: number,
  _wethPrice: number,
  alchemyKey?: string
): Promise<number> {
  return getTokenPrice(tokenAddress, alchemyKey);
}
