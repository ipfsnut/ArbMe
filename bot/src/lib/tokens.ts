/**
 * Token metadata and price fetching service
 */

import { createPublicClient, http, Address, formatUnits } from 'viem';
import { base } from 'viem/chains';

// Token metadata cache
const tokenCache = new Map<string, TokenMetadata>();

interface TokenMetadata {
  symbol: string;
  decimals: number;
  address: string;
}

interface TokenPrice {
  address: string;
  priceUsd: number;
}

// Known token addresses on Base
const KNOWN_TOKENS: Record<string, TokenMetadata> = {
  '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07'.toLowerCase(): {
    symbol: 'ARBME',
    decimals: 18,
    address: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07',
  },
  '0x4200000000000000000000000000000000000006'.toLowerCase(): {
    symbol: 'WETH',
    decimals: 18,
    address: '0x4200000000000000000000000000000000000006',
  },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'.toLowerCase(): {
    symbol: 'USDC',
    decimals: 6,
    address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  },
  '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb'.toLowerCase(): {
    symbol: 'CLANKER',
    decimals: 18,
    address: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb',
  },
  '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42'.toLowerCase(): {
    symbol: 'PAGE',
    decimals: 18,
    address: '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42',
  },
  '0x4ed4e862860bed51a9570b96d89af5e1b0efefed'.toLowerCase(): {
    symbol: 'DEGEN',
    decimals: 18,
    address: '0x4ed4e862860bed51a9570b96d89af5e1b0efefed',
  },
};

const ERC20_ABI = [
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

/**
 * Fetch token metadata (symbol, decimals) from chain
 */
export async function getTokenMetadata(
  tokenAddress: string,
  alchemyKey?: string
): Promise<TokenMetadata> {
  const normalizedAddress = tokenAddress.toLowerCase();

  // Check known tokens first
  if (KNOWN_TOKENS[normalizedAddress]) {
    return KNOWN_TOKENS[normalizedAddress];
  }

  // Check cache
  if (tokenCache.has(normalizedAddress)) {
    return tokenCache.get(normalizedAddress)!;
  }

  // Fetch from chain
  const rpcUrl = alchemyKey
    ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : 'https://mainnet.base.org';

  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }),
      client.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);

    const metadata: TokenMetadata = {
      symbol: symbol as string,
      decimals: Number(decimals),
      address: tokenAddress,
    };

    // Cache it
    tokenCache.set(normalizedAddress, metadata);

    return metadata;
  } catch (error) {
    console.error(`[Tokens] Failed to fetch metadata for ${tokenAddress}:`, error);
    // Return fallback
    return {
      symbol: 'UNKNOWN',
      decimals: 18,
      address: tokenAddress,
    };
  }
}

/**
 * Fetch token price from GeckoTerminal
 */
export async function getTokenPrice(tokenAddress: string): Promise<number> {
  try {
    const url = `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${tokenAddress}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Tokens] GeckoTerminal returned ${response.status} for ${tokenAddress}`);
      return 0;
    }

    const data = await response.json();
    const priceData = data?.data?.attributes?.token_prices?.[tokenAddress.toLowerCase()];

    if (priceData) {
      return parseFloat(priceData);
    }

    return 0;
  } catch (error) {
    console.error(`[Tokens] Failed to fetch price for ${tokenAddress}:`, error);
    return 0;
  }
}

/**
 * Fetch prices for multiple tokens in batch
 */
export async function getTokenPrices(tokenAddresses: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  // GeckoTerminal supports batch queries
  try {
    const addressList = tokenAddresses.join(',');
    const url = `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${addressList}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Tokens] Batch price fetch failed: ${response.status}`);
      return prices;
    }

    const data = await response.json();
    const tokenPrices = data?.data?.attributes?.token_prices || {};

    for (const address of tokenAddresses) {
      const normalizedAddress = address.toLowerCase();
      const price = tokenPrices[normalizedAddress];
      if (price) {
        prices.set(normalizedAddress, parseFloat(price));
      }
    }
  } catch (error) {
    console.error('[Tokens] Batch price fetch failed:', error);
  }

  return prices;
}

/**
 * Format token amount with proper decimals
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals);
}

/**
 * Calculate USD value from token amount
 */
export function calculateUsdValue(amount: bigint, decimals: number, priceUsd: number): number {
  const tokenAmount = parseFloat(formatUnits(amount, decimals));
  return tokenAmount * priceUsd;
}
