/**
 * Fetch user's Uniswap positions across V2, V3, and V4
 */

import { createPublicClient, http, Address, formatUnits, keccak256 } from 'viem';
import { base } from 'viem/chains';
import { getTokenMetadataBatch } from './tokens.js';
import { getTokenPrices, getTokenPricesOnChain } from './pricing.js';

// Contract addresses
const V2_ROUTER = '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24';
const V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';

// Known V2 pools — V2 has no NFT enumeration so pools must be listed explicitly.
// V3/V4 positions are discovered automatically via on-chain NFT ownership.
const KNOWN_POOLS = {
  V2: [
    { address: '0x11FD4947bE07E721B57622df3ef1E1C773ED5655', name: 'PAGE/ARBME' },
    { address: '0x14aeb8cfdf477001a60f5196ec2ddfe94771b794', name: 'CLANKER/ARBME' },
    // Add new V2 pools here as they're created
  ],
};

// Retry helper for flaky RPC calls
async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      console.warn(`[Positions] ${label} attempt ${attempt + 1} failed, retrying...`);
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

// ABIs
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const V2_PAIR_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
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

const V3_NFT_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'tokenOfOwnerByIndex',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'positions',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
  },
] as const;

const V4_NFT_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'tokenOfOwnerByIndex',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getPoolAndPositionInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: 'poolKey',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      { name: 'info', type: 'uint256' }, // PositionInfo is bit-packed uint256
    ],
  },
  {
    name: 'getPositionLiquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
] as const;

export interface Position {
  id: string;
  version: 'V2' | 'V3' | 'V4';
  pair: string; // e.g. "PAGE / ARBME"
  poolAddress: string;
  token0: {
    symbol: string;
    address: string;
    amount: number;
  };
  token1: {
    symbol: string;
    address: string;
    amount: number;
  };
  liquidity: string; // Human-readable display
  liquidityUsd: number; // USD value (0 if unknown)
  feesEarned: string; // Human-readable display
  feesEarnedUsd: number; // USD value (0 if unknown)
  priceRange?: { min: number; max: number }; // For V3/V4 positions
  inRange?: boolean; // For V3/V4 positions
  tokenId?: string; // For V3/V4 NFT positions
  fee?: number; // Fee tier for V3/V4 positions
  tickSpacing?: number; // Tick spacing for V4 positions
  hooks?: string; // Hooks address for V4 positions
}

// Internal position type used during fetching (before enrichment)
interface RawPosition {
  id: string;
  version: 'V2' | 'V3' | 'V4';
  pair: string;
  poolAddress: string;
  token0Address: string;
  token1Address: string;
  liquidity: string;
  liquidityUsd: number;
  feesEarned: string;
  feesEarnedUsd: number;
  priceRangeLow?: string;
  priceRangeHigh?: string;
  inRange?: boolean;
  tokenId?: string;
  fee?: number;
  tickSpacing?: number;
  hooks?: string;
  // V2-specific data for USD calculation
  v2Balance?: bigint;
  v2TotalSupply?: bigint;
  v2Reserve0?: bigint;
  v2Reserve1?: bigint;
  // V3-specific data for fee calculation
  v3TokensOwed0?: bigint;
  v3TokensOwed1?: bigint;
}

/**
 * Fetch all positions for a wallet address
 */
export async function fetchUserPositions(
  walletAddress: string,
  alchemyKey?: string
): Promise<Position[]> {
  const rpcUrl = alchemyKey
    ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : 'https://mainnet.base.org';

  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl, { timeout: 15_000 }),
  });

  const rawPositions: RawPosition[] = [];

  console.log(`[Positions] Fetching positions for wallet: ${walletAddress}`);

  // Fetch V2, V3, V4 independently — one failing doesn't kill the others
  const results = await Promise.allSettled([
    fetchV2Positions(client, walletAddress as Address),
    fetchV3Positions(client, walletAddress as Address),
    fetchV4Positions(client, walletAddress as Address, alchemyKey),
  ]);

  const labels = ['V2', 'V3', 'V4'];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      console.log(`[Positions] Found ${result.value.length} ${labels[i]} positions`);
      rawPositions.push(...result.value);
    } else {
      console.error(`[Positions] ${labels[i]} fetch failed (continuing with others):`, result.reason);
    }
  }

  // Enrich with token metadata and prices, converting to final Position type
  const positions = await enrichPositionsWithMetadata(rawPositions, alchemyKey);

  // Sort by TVL descending (highest value first), positions without USD go to end
  positions.sort((a, b) => b.liquidityUsd - a.liquidityUsd);

  return positions;
}

/**
 * Fetch V2 LP positions
 */
async function fetchV2Positions(client: any, wallet: Address): Promise<RawPosition[]> {
  const positions: RawPosition[] = [];

  for (const pool of KNOWN_POOLS.V2) {
    try {
      const balance = await client.readContract({
        address: pool.address as Address,
        abi: V2_PAIR_ABI,
        functionName: 'balanceOf',
        args: [wallet],
      });

      if (balance > 0n) {
        // Get pool details
        const [totalSupply, reserves, token0, token1] = await Promise.all([
          client.readContract({
            address: pool.address as Address,
            abi: V2_PAIR_ABI,
            functionName: 'totalSupply',
          }),
          client.readContract({
            address: pool.address as Address,
            abi: V2_PAIR_ABI,
            functionName: 'getReserves',
          }),
          client.readContract({
            address: pool.address as Address,
            abi: V2_PAIR_ABI,
            functionName: 'token0',
          }),
          client.readContract({
            address: pool.address as Address,
            abi: V2_PAIR_ABI,
            functionName: 'token1',
          }),
        ]);

        // Calculate share
        const sharePercent = (Number(balance) / Number(totalSupply)) * 100;
        const liquidityDisplay = `${sharePercent.toFixed(4)}% of pool`;

        positions.push({
          id: `v2-${pool.address}`,
          version: 'V2',
          pair: pool.name,
          poolAddress: pool.address,
          token0Address: token0 as string,
          token1Address: token1 as string,
          liquidity: liquidityDisplay,
          liquidityUsd: 0, // Will be calculated in enrichment
          feesEarned: 'N/A',
          feesEarnedUsd: 0,
          // Store V2 data for USD calculation
          v2Balance: balance,
          v2TotalSupply: totalSupply as bigint,
          v2Reserve0: reserves[0] as bigint,
          v2Reserve1: reserves[1] as bigint,
        });
      }
    } catch (error) {
      console.error(`[Positions] Error fetching V2 pool ${pool.address}:`, error);
    }
  }

  return positions;
}

/**
 * Fetch V3 NFT positions via multicall (2 round-trips instead of N)
 */
async function fetchV3Positions(client: any, wallet: Address): Promise<RawPosition[]> {
  const positions: RawPosition[] = [];

  try {
    // Get number of V3 positions
    const balance = await client.readContract({
      address: V3_POSITION_MANAGER as Address,
      abi: V3_NFT_ABI,
      functionName: 'balanceOf',
      args: [wallet],
    });

    const count = Number(balance);
    console.log(`[Positions] User has ${count} V3 positions`);

    if (count === 0) return positions;

    // Multicall A: Get all token IDs in one call
    const indexCalls = Array.from({ length: count }, (_, i) => ({
      address: V3_POSITION_MANAGER as Address,
      abi: V3_NFT_ABI,
      functionName: 'tokenOfOwnerByIndex' as const,
      args: [wallet, BigInt(i)] as const,
    }));

    const indexResults = await withRetry(
      () => client.multicall({ contracts: indexCalls, allowFailure: true }),
      'V3 tokenOfOwnerByIndex multicall'
    ) as { status: string; result?: bigint }[];

    const tokenIds: bigint[] = [];
    for (const r of indexResults) {
      if (r.status === 'success' && r.result !== undefined) {
        tokenIds.push(r.result);
      }
    }

    console.log(`[Positions] Resolved ${tokenIds.length}/${count} V3 token IDs`);

    if (tokenIds.length === 0) return positions;

    // Multicall B: Get all position data in one call
    const positionCalls = tokenIds.map((tokenId) => ({
      address: V3_POSITION_MANAGER as Address,
      abi: V3_NFT_ABI,
      functionName: 'positions' as const,
      args: [tokenId] as const,
    }));

    const positionResults = await withRetry(
      () => client.multicall({ contracts: positionCalls, allowFailure: true }),
      'V3 positions multicall'
    ) as { status: string; result?: readonly [bigint, string, string, string, number, number, number, bigint, bigint, bigint, bigint, bigint] }[];

    for (let i = 0; i < positionResults.length; i++) {
      const r = positionResults[i];
      if (r.status !== 'success' || !r.result) continue;

      const tokenId = tokenIds[i];
      const [
        nonce,
        operator,
        token0,
        token1,
        fee,
        tickLower,
        tickUpper,
        liquidity,
        feeGrowthInside0LastX128,
        feeGrowthInside1LastX128,
        tokensOwed0,
        tokensOwed1,
      ] = r.result;

      if (liquidity > 0n) {
        positions.push({
          id: `v3-${tokenId}`,
          version: 'V3',
          pair: `Token Pair`,
          poolAddress: V3_POSITION_MANAGER,
          token0Address: token0 as string,
          token1Address: token1 as string,
          liquidity: `${formatUnits(liquidity, 0)} liquidity`,
          liquidityUsd: 0,
          feesEarned: `${formatUnits(tokensOwed0, 18)} / ${formatUnits(tokensOwed1, 18)}`,
          feesEarnedUsd: 0,
          priceRangeLow: `Tick ${tickLower}`,
          priceRangeHigh: `Tick ${tickUpper}`,
          inRange: undefined,
          tokenId: tokenId.toString(),
          fee: Number(fee),
          v3TokensOwed0: tokensOwed0 as bigint,
          v3TokensOwed1: tokensOwed1 as bigint,
        });
      }
    }
  } catch (error) {
    console.error('[Positions] Error fetching V3 positions:', error);
  }

  return positions;
}

/**
 * Fetch V4 NFT positions
 * Note: V4 Position Manager does not implement ERC721Enumerable, so we use Alchemy NFT API
 */
async function fetchV4Positions(client: any, wallet: Address, alchemyKey?: string): Promise<RawPosition[]> {
  const positions: RawPosition[] = [];

  try {
    // Get number of V4 positions
    const balance = await client.readContract({
      address: V4_POSITION_MANAGER as Address,
      abi: V4_NFT_ABI,
      functionName: 'balanceOf',
      args: [wallet],
    });

    const count = Number(balance);
    console.log(`[Positions] User has ${count} V4 positions`);

    if (count === 0) {
      return positions;
    }

    // Use Alchemy NFT API to get token IDs
    let ownedTokenIds: string[] = [];

    if (alchemyKey) {
      try {
        // Paginate through all V4 NFTs (Alchemy returns max ~100 per page)
        // Wrapped in retry for resilience against transient Alchemy failures
        ownedTokenIds = await withRetry(async () => {
          const ids: string[] = [];
          const MAX_PAGES = 10;
          let pageKey: string | undefined;
          let pageCount = 0;
          do {
            const url = new URL(`https://base-mainnet.g.alchemy.com/nft/v3/${alchemyKey}/getNFTsForOwner`);
            url.searchParams.set('owner', wallet);
            url.searchParams.append('contractAddresses[]', V4_POSITION_MANAGER);
            url.searchParams.set('withMetadata', 'false');
            if (pageKey) url.searchParams.set('pageKey', pageKey);

            const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
            if (!response.ok) throw new Error(`Alchemy NFT API returned ${response.status}`);
            const data = await response.json() as any;

            const pageIds = data.ownedNfts?.map((nft: any) => nft.tokenId) || [];
            ids.push(...pageIds);
            pageKey = data.pageKey; // undefined when no more pages
            pageCount++;
            if (pageCount >= MAX_PAGES) {
              console.warn(`[Positions] Hit MAX_PAGES (${MAX_PAGES}) for V4 NFT pagination, stopping`);
              break;
            }
          } while (pageKey);
          return ids;
        }, 'V4 NFT enumeration');

        console.log(`[Positions] Found ${ownedTokenIds.length} V4 token IDs via Alchemy NFT API`);
      } catch (error) {
        console.error('[Positions] Alchemy NFT API failed after retries, skipping V4 positions:', error);
        return positions;
      }
    } else {
      console.log('[Positions] No Alchemy key provided, skipping V4 position enumeration');
      return positions;
    }

    // Helper function to extract tick values from bit-packed PositionInfo
    const extractTicks = (packedInfo: bigint): { tickLower: number; tickUpper: number } => {
      // PositionInfo layout (from LSB): hasSubscriber (8 bits) | tickLower (24 bits) | tickUpper (24 bits) | poolId (200 bits)
      // Must skip the first 8 bits (hasSubscriber) before extracting ticks
      const shifted = packedInfo >> BigInt(8);

      const tickLowerRaw = Number(shifted & BigInt(0xFFFFFF));
      const tickUpperRaw = Number((shifted >> BigInt(24)) & BigInt(0xFFFFFF));

      // Convert from unsigned to signed (int24 range: -8388608 to 8388607)
      const tickLower = tickLowerRaw > 0x7FFFFF ? tickLowerRaw - 0x1000000 : tickLowerRaw;
      const tickUpper = tickUpperRaw > 0x7FFFFF ? tickUpperRaw - 0x1000000 : tickUpperRaw;

      return { tickLower, tickUpper };
    };

    // Multicall: interleave getPoolAndPositionInfo + getPositionLiquidity for all positions
    const v4Calls = ownedTokenIds.flatMap((tokenIdStr) => {
      const tokenId = BigInt(tokenIdStr);
      return [
        {
          address: V4_POSITION_MANAGER as Address,
          abi: V4_NFT_ABI,
          functionName: 'getPoolAndPositionInfo' as const,
          args: [tokenId] as const,
        },
        {
          address: V4_POSITION_MANAGER as Address,
          abi: V4_NFT_ABI,
          functionName: 'getPositionLiquidity' as const,
          args: [tokenId] as const,
        },
      ];
    });

    console.log(`[Positions] Multicall: fetching ${ownedTokenIds.length} V4 positions (${v4Calls.length} calls)...`);

    const v4Results = await withRetry(
      () => client.multicall({ contracts: v4Calls, allowFailure: true }),
      'V4 position multicall'
    ) as { status: string; result?: any }[];

    // Process results in pairs
    for (let i = 0; i < ownedTokenIds.length; i++) {
      const infoResult = v4Results[i * 2];
      const liqResult = v4Results[i * 2 + 1];

      if (infoResult.status !== 'success' || liqResult.status !== 'success' || !infoResult.result || liqResult.result === undefined) {
        console.warn(`[Positions] V4 multicall failed for token ${ownedTokenIds[i]}`);
        continue;
      }

      const tokenId = BigInt(ownedTokenIds[i]);
      const [poolKey, packedInfo] = infoResult.result as readonly [any, bigint];
      const liquidity = liqResult.result as bigint;
      const { currency0, currency1, fee, tickSpacing, hooks } = poolKey as any;
      const { tickLower, tickUpper } = extractTicks(packedInfo);

      if (liquidity > 0n) {
        positions.push({
          id: `v4-${tokenId}`,
          version: 'V4',
          pair: `Token Pair`,
          poolAddress: V4_POSITION_MANAGER,
          token0Address: currency0 as string,
          token1Address: currency1 as string,
          liquidity: `${formatUnits(liquidity, 0)} liquidity`,
          liquidityUsd: 0,
          feesEarned: 'N/A',
          feesEarnedUsd: 0,
          priceRangeLow: `Tick ${tickLower}`,
          priceRangeHigh: `Tick ${tickUpper}`,
          inRange: undefined,
          tokenId: tokenId.toString(),
          fee: Number(fee),
          tickSpacing: Number(tickSpacing),
          hooks: hooks as string,
        });
      }
    }
  } catch (error) {
    console.error('[Positions] Error fetching V4 positions:', error);
  }

  return positions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Math Helpers for Concentrated Liquidity Positions (V3/V4)
// ═══════════════════════════════════════════════════════════════════════════════

const Q96 = BigInt(2) ** BigInt(96);

/**
 * Convert tick to sqrtPriceX96
 */
function tickToSqrtPriceX96(tick: number): bigint {
  const sqrtRatio = Math.sqrt(Math.pow(1.0001, tick));
  return BigInt(Math.floor(sqrtRatio * Math.pow(2, 96)));
}

/**
 * Calculate token amounts from liquidity and price range
 */
function calculateAmountsFromLiquidity(
  sqrtPriceX96: bigint,
  sqrtPriceLower: bigint,
  sqrtPriceUpper: bigint,
  liquidity: bigint
): { amount0: bigint; amount1: bigint } {
  const sqrtP = sqrtPriceX96;
  const sqrtPL = sqrtPriceLower;
  const sqrtPU = sqrtPriceUpper;
  const L = liquidity;

  let amount0 = BigInt(0);
  let amount1 = BigInt(0);

  if (sqrtP <= sqrtPL) {
    // Current price below range - all token0
    amount0 = (L * Q96 * (sqrtPU - sqrtPL)) / (sqrtPL * sqrtPU);
  } else if (sqrtP >= sqrtPU) {
    // Current price above range - all token1
    amount1 = (L * (sqrtPU - sqrtPL)) / Q96;
  } else {
    // Current price in range - mix of both
    amount0 = (L * Q96 * (sqrtPU - sqrtP)) / (sqrtP * sqrtPU);
    amount1 = (L * (sqrtP - sqrtPL)) / Q96;
  }

  return { amount0, amount1 };
}

// Enrichment result tracking
interface EnrichmentData {
  token0Amount: number;
  token1Amount: number;
  liquidityUsd: number;
  feesEarnedUsd: number;
  feesEarned: string;
  inRange?: boolean;
  priceRange?: { min: number; max: number };
}

/**
 * Enrich positions with token symbols, decimals, and USD values
 * Transforms RawPosition[] to Position[]
 *
 * Uses multicall to batch all RPC reads:
 * - Phase A: Collect unique pools from all positions
 * - Phase B: Batch fetch pool slot0 (1-2 multicalls)
 * - Phase C: Batch fetch V4 fee data (1 multicall)
 * - Phase D: Distribute results and calculate USD values (pure math)
 */
async function enrichPositionsWithMetadata(
  rawPositions: RawPosition[],
  alchemyKey?: string
): Promise<Position[]> {
  console.log(`[Positions] ═════ ENRICHMENT STARTED ═════`);
  console.log(`[Positions] Positions to enrich: ${rawPositions.length}`);
  console.log(`[Positions] Alchemy key present: ${!!alchemyKey}`);

  if (rawPositions.length === 0) return [];

  // Collect all unique token addresses
  const tokenAddresses = new Set<string>();
  for (const position of rawPositions) {
    tokenAddresses.add(position.token0Address.toLowerCase());
    tokenAddresses.add(position.token1Address.toLowerCase());
  }

  console.log(`[Positions] Fetching metadata for ${tokenAddresses.size} tokens (batch multicall)...`);

  // Batch fetch all token metadata via single multicall
  const batchMetadata = await getTokenMetadataBatch(Array.from(tokenAddresses), alchemyKey);

  // Build metadata map
  const metadataMap = new Map<string, { symbol: string; decimals: number }>();
  for (const address of tokenAddresses) {
    const meta = batchMetadata.get(address);
    if (meta) {
      metadataMap.set(address, { symbol: meta.symbol, decimals: meta.decimals });
    } else {
      metadataMap.set(address, { symbol: '???', decimals: 18 });
    }
  }

  // Fetch token prices using on-chain pricing (with GeckoTerminal as fallback)
  const tokensWithDecimals = Array.from(tokenAddresses).map(address => ({
    address,
    decimals: metadataMap.get(address)?.decimals || 18,
  }));

  console.log(`[Positions] Fetching on-chain prices for tokens...`);
  const priceMap = new Map<string, number>();
  let onChainPrices = new Map<string, number>();

  try {
    onChainPrices = await getTokenPricesOnChain(tokensWithDecimals, alchemyKey);
  } catch (error) {
    console.warn(`[Positions] On-chain pricing failed, continuing with empty prices:`, error);
  }

  // If on-chain pricing fails or returns few prices, fallback to GeckoTerminal
  if (onChainPrices.size < tokenAddresses.size * 0.5) {
    console.log(`[Positions] On-chain pricing returned only ${onChainPrices.size}/${tokenAddresses.size} prices, falling back to GeckoTerminal`);
    let geckoterminPrices = new Map<string, number>();
    try {
      geckoterminPrices = await getTokenPrices(Array.from(tokenAddresses));
    } catch (error) {
      console.warn(`[Positions] GeckoTerminal pricing also failed, positions will show $0:`, error);
    }
    // Merge: prefer on-chain, fallback to GeckoTerminal
    for (const address of tokenAddresses) {
      const onChainPrice = onChainPrices.get(address);
      const geckoPrice = geckoterminPrices.get(address);
      priceMap.set(address, onChainPrice || geckoPrice || 0);
    }
  } else {
    // On-chain pricing worked well, use it
    console.log(`[Positions] On-chain pricing successful: ${onChainPrices.size}/${tokenAddresses.size} prices`);
    for (const address of tokenAddresses) {
      priceMap.set(address, onChainPrices.get(address) || 0);
    }
  }

  // Create a shared RPC client for all enrichment calls
  const rpcUrl = alchemyKey
    ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : 'https://mainnet.base.org';
  const enrichClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl, { timeout: 30_000 }),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase A: Collect unique pools from all positions
  // ═══════════════════════════════════════════════════════════════════════════

  interface PoolKey {
    token0: string;
    token1: string;
    fee: number;
    version: 'V3' | 'V4';
    tickSpacing?: number;
    hooks?: string;
  }

  function makePoolKey(raw: RawPosition): string | null {
    if (raw.version === 'V2' || raw.fee === undefined) return null;
    const t0 = raw.token0Address.toLowerCase();
    const t1 = raw.token1Address.toLowerCase();
    if (raw.version === 'V3') return `V3|${t0}|${t1}|${raw.fee}`;
    if (raw.version === 'V4' && raw.tickSpacing !== undefined && raw.hooks)
      return `V4|${t0}|${t1}|${raw.fee}|${raw.tickSpacing}|${raw.hooks.toLowerCase()}`;
    return null;
  }

  const uniquePools = new Map<string, PoolKey>();
  for (const raw of rawPositions) {
    const key = makePoolKey(raw);
    if (key && !uniquePools.has(key)) {
      uniquePools.set(key, {
        token0: raw.token0Address,
        token1: raw.token1Address,
        fee: raw.fee!,
        version: raw.version as 'V3' | 'V4',
        tickSpacing: raw.tickSpacing,
        hooks: raw.hooks,
      });
    }
  }

  console.log(`[Positions] Found ${uniquePools.size} unique pools from ${rawPositions.length} positions`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase B: Batch fetch pool state (slot0) via multicall
  // ═══════════════════════════════════════════════════════════════════════════

  // Pool state results: poolKey -> { sqrtPriceX96, tick }
  const poolStateMap = new Map<string, { sqrtPriceX96: bigint; tick: number }>();

  // Separate V3 and V4 pools
  const v3Pools: { key: string; pool: PoolKey }[] = [];
  const v4Pools: { key: string; pool: PoolKey; poolId: `0x${string}` }[] = [];

  for (const [key, pool] of uniquePools) {
    if (pool.version === 'V3') {
      v3Pools.push({ key, pool });
    } else if (pool.version === 'V4' && pool.tickSpacing !== undefined && pool.hooks) {
      const poolId = calculateV4PoolId(pool.token0, pool.token1, pool.fee, pool.tickSpacing, pool.hooks);
      v4Pools.push({ key, pool, poolId });
    }
  }

  // V3: First multicall to get pool addresses from factory
  if (v3Pools.length > 0) {
    console.log(`[Positions] Multicall: fetching ${v3Pools.length} V3 pool addresses...`);
    try {
      const factoryCalls = v3Pools.map(({ pool }) => ({
        address: V3_FACTORY as Address,
        abi: V3_FACTORY_ABI,
        functionName: 'getPool' as const,
        args: [pool.token0 as Address, pool.token1 as Address, pool.fee] as const,
      }));

      const factoryResults = await enrichClient.multicall({ contracts: factoryCalls, allowFailure: true });

      // Collect valid pool addresses for slot0 multicall
      const v3PoolAddresses: { key: string; address: Address }[] = [];
      for (let i = 0; i < factoryResults.length; i++) {
        const result = factoryResults[i];
        if (result.status === 'success' && result.result && result.result !== '0x0000000000000000000000000000000000000000') {
          v3PoolAddresses.push({ key: v3Pools[i].key, address: result.result as Address });
        } else {
          console.warn(`[Positions] V3 pool not found for ${v3Pools[i].key}`);
        }
      }

      // Second multicall: fetch slot0 for all discovered V3 pool addresses
      if (v3PoolAddresses.length > 0) {
        console.log(`[Positions] Multicall: fetching ${v3PoolAddresses.length} V3 slot0s...`);
        const slot0Calls = v3PoolAddresses.map(({ address }) => ({
          address,
          abi: V3_POOL_ABI,
          functionName: 'slot0' as const,
        }));

        const slot0Results = await enrichClient.multicall({ contracts: slot0Calls, allowFailure: true });

        for (let i = 0; i < slot0Results.length; i++) {
          const result = slot0Results[i];
          if (result.status === 'success' && result.result) {
            const res = result.result as unknown as readonly [bigint, number, ...unknown[]];
            poolStateMap.set(v3PoolAddresses[i].key, { sqrtPriceX96: res[0], tick: Number(res[1]) });
          }
        }
      }
    } catch (error) {
      console.error(`[Positions] V3 multicall failed, will fall back to derived prices:`, error);
    }
  }

  // V4: Single multicall for all slot0s
  if (v4Pools.length > 0) {
    console.log(`[Positions] Multicall: fetching ${v4Pools.length} V4 slot0s...`);
    try {
      const v4Slot0Calls = v4Pools.map(({ poolId }) => ({
        address: V4_STATE_VIEW as Address,
        abi: V4_STATE_VIEW_ABI,
        functionName: 'getSlot0' as const,
        args: [poolId] as const,
      }));

      const v4Slot0Results = await enrichClient.multicall({ contracts: v4Slot0Calls, allowFailure: true });

      for (let i = 0; i < v4Slot0Results.length; i++) {
        const result = v4Slot0Results[i];
        if (result.status === 'success' && result.result) {
          const res = result.result as unknown as readonly [bigint, number, ...unknown[]];
          poolStateMap.set(v4Pools[i].key, { sqrtPriceX96: res[0], tick: Number(res[1]) });
        }
      }
    } catch (error) {
      console.error(`[Positions] V4 slot0 multicall failed, will fall back to derived prices:`, error);
    }
  }

  console.log(`[Positions] Pool state fetched for ${poolStateMap.size}/${uniquePools.size} pools`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase C: Batch fetch V4 fee data via multicall
  // ═══════════════════════════════════════════════════════════════════════════

  interface V4FeeInput {
    rawIndex: number;
    poolId: `0x${string}`;
    positionId: `0x${string}`;
    tickLower: number;
    tickUpper: number;
  }

  const v4FeeInputs: V4FeeInput[] = [];

  for (let i = 0; i < rawPositions.length; i++) {
    const raw = rawPositions[i];
    if (raw.version !== 'V4' || !raw.tokenId || raw.fee === undefined || raw.tickSpacing === undefined || !raw.hooks) continue;

    const tickLower = extractTickFromString(raw.priceRangeLow);
    const tickUpper = extractTickFromString(raw.priceRangeHigh);
    if (tickLower === null || tickUpper === null) continue;

    const poolId = calculateV4PoolId(raw.token0Address, raw.token1Address, raw.fee, raw.tickSpacing, raw.hooks);
    const positionId = calculateV4PositionId(V4_POSITION_MANAGER, tickLower, tickUpper, raw.tokenId);

    v4FeeInputs.push({ rawIndex: i, poolId, positionId, tickLower, tickUpper });
  }

  // Results: rawIndex -> { fees0, fees1 in raw bigint }
  const v4FeeResults = new Map<number, { feesEarnedUsd: number; feesEarned: string }>();

  if (v4FeeInputs.length > 0) {
    console.log(`[Positions] Multicall: fetching fee data for ${v4FeeInputs.length} V4 positions...`);
    try {
      // Build interleaved multicall: [getFeeGrowthInside, getPositionInfo, getFeeGrowthInside, getPositionInfo, ...]
      const feeCalls = v4FeeInputs.flatMap(({ poolId, positionId, tickLower, tickUpper }) => [
        {
          address: V4_STATE_VIEW as Address,
          abi: V4_STATE_VIEW_ABI,
          functionName: 'getFeeGrowthInside' as const,
          args: [poolId, tickLower, tickUpper] as const,
        },
        {
          address: V4_STATE_VIEW as Address,
          abi: V4_STATE_VIEW_ABI,
          functionName: 'getPositionInfo' as const,
          args: [poolId, positionId] as const,
        },
      ]);

      const feeResults = await enrichClient.multicall({ contracts: feeCalls, allowFailure: true });

      // Process results in pairs
      for (let i = 0; i < v4FeeInputs.length; i++) {
        const feeGrowthResult = feeResults[i * 2];
        const posInfoResult = feeResults[i * 2 + 1];

        if (feeGrowthResult.status !== 'success' || posInfoResult.status !== 'success') {
          console.warn(`[Positions] V4 fee multicall failed for position index ${v4FeeInputs[i].rawIndex}`);
          continue;
        }

        const raw = rawPositions[v4FeeInputs[i].rawIndex];
        const d0 = metadataMap.get(raw.token0Address.toLowerCase())?.decimals ?? 18;
        const d1 = metadataMap.get(raw.token1Address.toLowerCase())?.decimals ?? 18;
        const price0 = priceMap.get(raw.token0Address.toLowerCase()) || 0;
        const price1 = priceMap.get(raw.token1Address.toLowerCase()) || 0;

        const [feeGrowthInside0, feeGrowthInside1] = feeGrowthResult.result as [bigint, bigint];
        const [posLiquidity, feeGrowthInside0Last, feeGrowthInside1Last] = posInfoResult.result as [bigint, bigint, bigint];

        const liquidity = BigInt(raw.liquidity.replace(/[^\d]/g, ''));
        const actualLiquidity = posLiquidity > 0n ? posLiquidity : liquidity;

        const Q128 = BigInt(2) ** BigInt(128);
        const feeGrowthDelta0 = feeGrowthInside0 >= feeGrowthInside0Last ? feeGrowthInside0 - feeGrowthInside0Last : 0n;
        const feeGrowthDelta1 = feeGrowthInside1 >= feeGrowthInside1Last ? feeGrowthInside1 - feeGrowthInside1Last : 0n;

        const fees0Raw = (feeGrowthDelta0 * actualLiquidity) / Q128;
        const fees1Raw = (feeGrowthDelta1 * actualLiquidity) / Q128;

        const fees0 = Number(fees0Raw) / Math.pow(10, d0);
        const fees1 = Number(fees1Raw) / Math.pow(10, d1);
        const totalFeesUsd = fees0 * price0 + fees1 * price1;

        v4FeeResults.set(v4FeeInputs[i].rawIndex, {
          feesEarnedUsd: totalFeesUsd,
          feesEarned: `${fees0.toFixed(6)} / ${fees1.toFixed(6)}`,
        });
      }
    } catch (error) {
      console.error(`[Positions] V4 fee multicall failed:`, error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase D: Distribute results and calculate USD values (pure math, no RPC)
  // ═══════════════════════════════════════════════════════════════════════════

  const positions: Position[] = rawPositions.map((raw, rawIndex) => {
    try {
      const token0Meta = metadataMap.get(raw.token0Address.toLowerCase());
      const token1Meta = metadataMap.get(raw.token1Address.toLowerCase());
      const token0Price = priceMap.get(raw.token0Address.toLowerCase()) || 0;
      const token1Price = priceMap.get(raw.token1Address.toLowerCase()) || 0;

      const d0 = token0Meta?.decimals ?? 18;
      const d1 = token1Meta?.decimals ?? 18;

      const enrichmentData: EnrichmentData = {
        token0Amount: 0,
        token1Amount: 0,
        liquidityUsd: 0,
        feesEarnedUsd: raw.feesEarnedUsd,
        feesEarned: raw.feesEarned,
        inRange: raw.inRange,
      };

      // V2: already have all data from fetch phase
      if (raw.version === 'V2' && raw.v2Balance && raw.v2TotalSupply && raw.v2Reserve0 && raw.v2Reserve1) {
        const v2Data = calculateV2Amounts(raw, d0, d1, token0Price, token1Price);
        Object.assign(enrichmentData, v2Data);
      }

      // V3/V4: use batched pool state from Phase B
      if ((raw.version === 'V3' || raw.version === 'V4') && raw.fee !== undefined) {
        const poolKey = makePoolKey(raw);
        const slot0Data = poolKey ? poolStateMap.get(poolKey) : null;

        const tickLower = extractTickFromString(raw.priceRangeLow);
        const tickUpper = extractTickFromString(raw.priceRangeHigh);

        if (tickLower !== null && tickUpper !== null &&
            tickLower >= -887272 && tickLower <= 887272 &&
            tickUpper >= -887272 && tickUpper <= 887272) {

          let sqrtPriceX96: bigint | null = null;
          let currentTick: number | null = null;

          if (slot0Data) {
            sqrtPriceX96 = slot0Data.sqrtPriceX96;
            currentTick = slot0Data.tick;
          } else if (token0Price > 0 && token1Price > 0) {
            // Derive from USD prices as fallback
            const derivedPrice = token0Price / token1Price;
            if (isFinite(derivedPrice) && derivedPrice > 0) {
              currentTick = Math.round(Math.log(derivedPrice) / Math.log(1.0001));
              if (isFinite(currentTick) && currentTick >= -887272 && currentTick <= 887272) {
                sqrtPriceX96 = tickToSqrtPriceX96(currentTick);
              }
            }
          }

          if (sqrtPriceX96 !== null && currentTick !== null) {
            try {
              const liquidity = BigInt(raw.liquidity.replace(/[^\d]/g, ''));
              const sqrtPriceLower = tickToSqrtPriceX96(tickLower);
              const sqrtPriceUpper = tickToSqrtPriceX96(tickUpper);

              const { amount0, amount1 } = calculateAmountsFromLiquidity(
                sqrtPriceX96, sqrtPriceLower, sqrtPriceUpper, liquidity
              );

              enrichmentData.token0Amount = Number(amount0) / Math.pow(10, d0);
              enrichmentData.token1Amount = Number(amount1) / Math.pow(10, d1);
              enrichmentData.liquidityUsd = enrichmentData.token0Amount * token0Price + enrichmentData.token1Amount * token1Price;
              enrichmentData.inRange = currentTick >= tickLower && currentTick <= tickUpper;
              enrichmentData.priceRange = {
                min: Math.pow(1.0001, tickLower),
                max: Math.pow(1.0001, tickUpper),
              };
            } catch (error) {
              console.error(`[Positions] Error calculating amounts for ${raw.id}:`, error);
            }
          }
        }

        // V3 fees from tokensOwed (already fetched in position data)
        if (raw.version === 'V3' && raw.v3TokensOwed0 !== undefined && raw.v3TokensOwed1 !== undefined) {
          const fees0 = Number(raw.v3TokensOwed0) / Math.pow(10, d0);
          const fees1 = Number(raw.v3TokensOwed1) / Math.pow(10, d1);
          enrichmentData.feesEarnedUsd = fees0 * token0Price + fees1 * token1Price;
          enrichmentData.feesEarned = `${fees0.toFixed(6)} / ${fees1.toFixed(6)}`;
        }

        // V4 fees from Phase C multicall
        if (raw.version === 'V4') {
          const v4Fees = v4FeeResults.get(rawIndex);
          if (v4Fees) {
            enrichmentData.feesEarnedUsd = v4Fees.feesEarnedUsd;
            enrichmentData.feesEarned = v4Fees.feesEarned;
          }
        }
      }

      return {
        id: raw.id,
        version: raw.version,
        pair: token0Meta && token1Meta ? `${token0Meta.symbol} / ${token1Meta.symbol}` : raw.pair,
        poolAddress: raw.poolAddress,
        token0: {
          symbol: token0Meta?.symbol || '???',
          address: raw.token0Address,
          amount: enrichmentData.token0Amount,
        },
        token1: {
          symbol: token1Meta?.symbol || '???',
          address: raw.token1Address,
          amount: enrichmentData.token1Amount,
        },
        liquidity: raw.liquidity,
        liquidityUsd: enrichmentData.liquidityUsd,
        feesEarned: enrichmentData.feesEarned,
        feesEarnedUsd: enrichmentData.feesEarnedUsd,
        inRange: enrichmentData.inRange,
        priceRange: enrichmentData.priceRange,
        tokenId: raw.tokenId,
        fee: raw.fee,
        tickSpacing: raw.tickSpacing,
        hooks: raw.hooks,
      } as Position;
    } catch (error) {
      console.error(`[Positions] Error enriching position ${raw.id}:`, error);
      return {
        id: raw.id,
        version: raw.version,
        pair: raw.pair,
        poolAddress: raw.poolAddress,
        token0: { symbol: '???', address: raw.token0Address, amount: 0 },
        token1: { symbol: '???', address: raw.token1Address, amount: 0 },
        liquidity: raw.liquidity,
        liquidityUsd: 0,
        feesEarned: raw.feesEarned,
        feesEarnedUsd: 0,
        tokenId: raw.tokenId,
        fee: raw.fee,
        tickSpacing: raw.tickSpacing,
        hooks: raw.hooks,
      } as Position;
    }
  });

  console.log(`[Positions] Enriched ${positions.length} positions with metadata`);
  return positions;
}

/**
 * Calculate V2 position amounts and USD values
 */
function calculateV2Amounts(
  raw: RawPosition,
  decimals0: number,
  decimals1: number,
  price0: number,
  price1: number
): Partial<EnrichmentData> {
  if (!raw.v2Balance || !raw.v2TotalSupply || !raw.v2Reserve0 || !raw.v2Reserve1) {
    return {};
  }

  try {
    // Calculate user's token amounts in BigInt to avoid precision loss
    // userAmount = (balance * reserve) / totalSupply
    const userAmount0Wei = (raw.v2Balance * raw.v2Reserve0) / raw.v2TotalSupply;
    const userAmount1Wei = (raw.v2Balance * raw.v2Reserve1) / raw.v2TotalSupply;

    // Convert to human-readable amounts (now safe to convert to Number)
    const token0Amount = Number(userAmount0Wei) / Math.pow(10, decimals0);
    const token1Amount = Number(userAmount1Wei) / Math.pow(10, decimals1);

    // Calculate USD values
    const amount0Usd = token0Amount * price0;
    const amount1Usd = token1Amount * price1;
    const totalUsd = amount0Usd + amount1Usd;

    console.log(
      `[Positions] V2 ${raw.id}: $${totalUsd.toFixed(2)} (${token0Amount.toFixed(4)} + ${token1Amount.toFixed(4)})`
    );

    return {
      token0Amount,
      token1Amount,
      liquidityUsd: totalUsd,
    };
  } catch (error) {
    console.error(`[Positions] Error calculating V2 amounts for ${raw.id}:`, error);
    return {};
  }
}

// calculateConcentratedLiquidityAmounts and calculateV4Fees removed —
// their logic is now inlined in enrichPositionsWithMetadata Phases B-D (multicall)

/**
 * Extract tick number from tick string (e.g., "Tick -276320" -> -276320)
 */
function extractTickFromString(tickStr?: string): number | null {
  if (!tickStr) return null;
  const match = tickStr.match(/-?\d+/);
  return match ? parseInt(match[0]) : null;
}

// V3 Pool ABI (slot0)
const V3_POOL_ABI = [
  {
    name: 'slot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
  {
    name: 'factory',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

// V3 Factory ABI (getPool)
const V3_FACTORY_ABI = [
  {
    name: 'getPool',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
] as const;

// V4 StateView ABI (getSlot0, getFeeGrowthInside, getPositionInfo)
const V4_STATE_VIEW_ABI = [
  {
    name: 'getSlot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'poolId', type: 'bytes32' },
    ],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
  },
  {
    name: 'getFeeGrowthInside',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'poolId', type: 'bytes32' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
    ],
    outputs: [
      { name: 'feeGrowthInside0X128', type: 'uint256' },
      { name: 'feeGrowthInside1X128', type: 'uint256' },
    ],
  },
  {
    name: 'getPositionInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'poolId', type: 'bytes32' },
      { name: 'positionId', type: 'bytes32' },
    ],
    outputs: [
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
    ],
  },
] as const;

const V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const V4_STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71'; // Uniswap V4 StateView on Base

// Helper to calculate V4 pool ID
function calculateV4PoolId(
  currency0: string,
  currency1: string,
  fee: number,
  tickSpacing: number,
  hooks: string
): `0x${string}` {
  const poolKeyEncoded =
    currency0.slice(2).toLowerCase().padStart(64, '0') +
    currency1.slice(2).toLowerCase().padStart(64, '0') +
    fee.toString(16).padStart(64, '0') +
    tickSpacing.toString(16).padStart(64, '0') +
    hooks.slice(2).toLowerCase().padStart(64, '0');

  return keccak256(`0x${poolKeyEncoded}` as `0x${string}`);
}

// Helper to encode int24 for position ID calculation
function encodeInt24(val: number): string {
  if (val < 0) {
    // Two's complement for negative numbers
    const twosComp = (1 << 24) + val;
    return twosComp.toString(16).padStart(6, '0');
  }
  return val.toString(16).padStart(6, '0');
}

// Helper to calculate V4 position ID
function calculateV4PositionId(
  positionManager: string,
  tickLower: number,
  tickUpper: number,
  tokenId: string
): `0x${string}` {
  const positionIdInput =
    positionManager.slice(2).toLowerCase() +
    encodeInt24(tickLower) +
    encodeInt24(tickUpper) +
    BigInt(tokenId).toString(16).padStart(64, '0');

  return keccak256(`0x${positionIdInput}` as `0x${string}`);
}

// fetchPoolSqrtPriceForRaw removed — slot0 fetching is now batched in Phase B multicall
