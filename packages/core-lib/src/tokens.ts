/**
 * Token metadata service
 *
 * For pricing, use ./pricing.ts instead
 */

import { createPublicClient, http, Address, formatUnits } from 'viem';
import { base } from 'viem/chains';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface TokenMetadata {
  symbol: string;
  decimals: number;
  address: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Token Registry
// ═══════════════════════════════════════════════════════════════════════════════

// Token metadata cache
const tokenCache = new Map<string, TokenMetadata>();

// Canonical token registry for Base — single source of truth
// All other token lists in the app should import from here
export const KNOWN_TOKENS: Record<string, TokenMetadata> = {
  // ── Core Ecosystem ──
  '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07': {
    symbol: 'ARBME', decimals: 18,
    address: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07',
  },
  '0x392bc5deea227043d69af0e67badcbbaed511b07': {
    symbol: 'RATCHET', decimals: 18,
    address: '0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07',
  },
  '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292': {
    symbol: 'CHAOS', decimals: 18,
    address: '0xFaB2ee8eB6B26208BfB5c41012661e62b4Dc9292',
  },
  '0x8c19a8b92fa406ae097eb9ea8a4a44cbc10eafe2': {
    symbol: 'ALPHACLAW', decimals: 18,
    address: '0x8C19A8b92FA406Ae097EB9eA8a4A44cBC10EafE2',
  },
  '0x5c0872b790bb73e2b3a9778db6e7704095624b07': {
    symbol: 'ABC', decimals: 18,
    address: '0x5c0872b790Bb73e2B3A9778Db6E7704095624b07',
  },
  '0xc4730f86d1f86ce0712a7b17ee919db7defad7fe': {
    symbol: 'PAGE', decimals: 18,
    address: '0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE',
  },
  // ── Connected Tokens ──
  '0xa448d40f6793773938a6b7427091c35676899125': {
    symbol: 'MLTL', decimals: 18,
    address: '0xa448d40f6793773938a6b7427091c35676899125',
  },
  '0xb695559b26bb2c9703ef1935c37aeae9526bab07': {
    symbol: 'MOLT', decimals: 18,
    address: '0xB695559b26BB2c9703ef1935c37AeaE9526bab07',
  },
  '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb': {
    symbol: 'CLANKER', decimals: 18,
    address: '0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb',
  },
  '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b': {
    symbol: 'BNKR', decimals: 18,
    address: '0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b',
  },
  '0x53ad48291407e16e29822deb505b30d47f965ebb': {
    symbol: 'CLAWD', decimals: 18,
    address: '0x53aD48291407E16E29822DeB505b30D47F965Ebb',
  },
  '0xf3bb567d4c79cb32d92b9db151255cdd3b91f04a': {
    symbol: 'OPENCLAW', decimals: 18,
    address: '0xf3bb567d4c79cb32d92b9db151255cdd3b91f04a',
  },
  '0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e': {
    symbol: 'OSO', decimals: 18,
    address: '0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e',
  },
  '0x01de044ad8eb037334ddda97a38bb0c798e4eb07': {
    symbol: 'CNEWS', decimals: 18,
    address: '0x01de044ad8eb037334ddda97a38bb0c798e4eb07',
  },
  // ── Base Assets ──
  '0x4200000000000000000000000000000000000006': {
    symbol: 'WETH', decimals: 18,
    address: '0x4200000000000000000000000000000000000006',
  },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
    symbol: 'USDC', decimals: 6,
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  '0x000000000d564d5be76f7f0d28fe52605afc7cf8': {
    symbol: 'flETH', decimals: 18,
    address: '0x000000000D564D5be76f7f0d28fE52605afC7Cf8',
  },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': {
    symbol: 'cbBTC', decimals: 8,
    address: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
  },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': {
    symbol: 'DAI', decimals: 18,
    address: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
  },
  '0x4ed4e862860bed51a9570b96d89af5e1b0efefed': {
    symbol: 'DEGEN', decimals: 18,
    address: '0x4ed4e862860bed51a9570b96d89af5e1b0efefed',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ABI
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch token metadata (symbol, decimals) from chain or cache
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

/**
 * Clear the token metadata cache
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}
