/**
 * Token Pricing Service
 *
 * Primary: GeckoTerminal API (good coverage, fast)
 * Fallback: On-chain pool reserves (for unlisted tokens)
 */

import { createPublicClient, http, Address } from 'viem';
import { base } from 'viem/chains';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface CachedPrice {
  price: number;
  timestamp: number;
  source: 'gecko' | 'onchain';
}

interface GeckoTokenPrice {
  decimals: number;
  symbol: string;
  price: number;
  timestamp: number;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const GECKO_API = 'https://api.geckoterminal.com/api/v2';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

// Cache TTL in milliseconds
const CACHE_TTL = 30_000; // 30 seconds

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
    priceCache.delete(normalized);
    return null;
  }

  return cached.price;
}

function setCachedPrice(address: string, price: number, source: 'gecko' | 'onchain'): void {
  priceCache.set(address.toLowerCase(), {
    price,
    timestamp: Date.now(),
    source,
  });
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
// On-Chain Fallback (for tokens not on GeckoTerminal)
// ═══════════════════════════════════════════════════════════════════════════════

const V2_PAIR_ABI = [
  {
    name: 'getReserves',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
  },
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'token1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const ERC20_DECIMALS_ABI = [
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

// Known WETH pairs for fallback pricing (token -> pool address)
const WETH_PAIRS: Record<string, string> = {
  // Add known WETH pairs here for tokens that might not be on GeckoTerminal
};

/**
 * Calculate price from V2 pool reserves (fallback)
 */
async function fetchOnChainPrice(
  tokenAddress: string,
  wethPrice: number,
  alchemyKey?: string
): Promise<number> {
  const normalized = tokenAddress.toLowerCase();
  const poolAddress = WETH_PAIRS[normalized];

  if (!poolAddress) {
    return 0;
  }

  const rpcUrl = alchemyKey
    ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : 'https://mainnet.base.org';

  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  try {
    const [reserves, token0, decimals] = await Promise.all([
      client.readContract({
        address: poolAddress as Address,
        abi: V2_PAIR_ABI,
        functionName: 'getReserves',
      }),
      client.readContract({
        address: poolAddress as Address,
        abi: V2_PAIR_ABI,
        functionName: 'token0',
      }),
      client.readContract({
        address: tokenAddress as Address,
        abi: ERC20_DECIMALS_ABI,
        functionName: 'decimals',
      }),
    ]);

    const [reserve0, reserve1] = reserves as [bigint, bigint, number];
    const isToken0 = (token0 as string).toLowerCase() === normalized;

    // Calculate price relative to WETH
    const tokenReserve = isToken0 ? reserve0 : reserve1;
    const wethReserve = isToken0 ? reserve1 : reserve0;
    const tokenDecimals = Number(decimals);

    const tokenAmount = Number(tokenReserve) / Math.pow(10, tokenDecimals);
    const wethAmount = Number(wethReserve) / Math.pow(10, 18);

    if (tokenAmount === 0) return 0;

    const priceInWeth = wethAmount / tokenAmount;
    return priceInWeth * wethPrice;
  } catch (error) {
    console.error(`[Pricing] On-chain fallback failed for ${tokenAddress}:`, error);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get price for a single token
 */
export async function getTokenPrice(
  tokenAddress: string,
  alchemyKey?: string
): Promise<number> {
  const normalized = tokenAddress.toLowerCase();

  // Check cache first
  const cached = getCachedPrice(normalized);
  if (cached !== null) {
    return cached;
  }

  // Fetch from GeckoTerminal
  const price = await fetchGeckoPrice(normalized);

  if (price > 0) {
    setCachedPrice(normalized, price, 'gecko');
    return price;
  }

  // Fallback to on-chain if available
  const wethPrice = getCachedPrice(WETH_ADDRESS) || await fetchGeckoPrice(WETH_ADDRESS);
  if (wethPrice > 0) {
    setCachedPrice(WETH_ADDRESS, wethPrice, 'gecko');

    const onChainPrice = await fetchOnChainPrice(normalized, wethPrice, alchemyKey);
    if (onChainPrice > 0) {
      setCachedPrice(normalized, onChainPrice, 'onchain');
      return onChainPrice;
    }
  }

  return 0;
}

/**
 * Get prices for multiple tokens (batched, cached)
 */
export async function getTokenPrices(
  tokenAddresses: string[],
  alchemyKey?: string
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  const uncached: string[] = [];

  // Check cache first
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

  console.log(`[Pricing] ${results.size} cached, fetching ${uncached.length} from GeckoTerminal`);

  // Fetch uncached from GeckoTerminal
  const geckoPrices = await fetchGeckoPrices(uncached);

  for (const [addr, price] of geckoPrices) {
    setCachedPrice(addr, price, 'gecko');
    results.set(addr, price);
  }

  // Find tokens that GeckoTerminal didn't have
  const stillMissing = uncached.filter(addr => !geckoPrices.has(addr));

  if (stillMissing.length > 0) {
    console.log(`[Pricing] ${stillMissing.length} tokens not on GeckoTerminal, trying on-chain fallback`);

    // Get WETH price for on-chain calculations
    let wethPrice = getCachedPrice(WETH_ADDRESS);
    if (!wethPrice) {
      wethPrice = await fetchGeckoPrice(WETH_ADDRESS);
      if (wethPrice > 0) {
        setCachedPrice(WETH_ADDRESS, wethPrice, 'gecko');
      }
    }

    if (wethPrice && wethPrice > 0) {
      for (const addr of stillMissing) {
        const onChainPrice = await fetchOnChainPrice(addr, wethPrice, alchemyKey);
        if (onChainPrice > 0) {
          setCachedPrice(addr, onChainPrice, 'onchain');
          results.set(addr, onChainPrice);
        }
      }
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

/**
 * Clear the price cache (useful for testing)
 */
export function clearPriceCache(): void {
  priceCache.clear();
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

/**
 * Legacy function - accepts array of {address, decimals} objects
 * Now just extracts addresses and calls getTokenPrices
 */
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
