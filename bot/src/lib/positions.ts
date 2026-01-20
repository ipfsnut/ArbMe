/**
 * Fetch user's Uniswap positions across V2, V3, and V4
 */

import { createPublicClient, http, Address, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { getTokenMetadata, getTokenPrices, calculateUsdValue } from './tokens.js';

// Contract addresses
const V2_ROUTER = '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24';
const V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';

// Known ARBME pools
const KNOWN_POOLS = {
  V2: [
    { address: '0x11FD4947bE07E721B57622df3ef1E1C773ED5655', name: 'PAGE/ARBME' },
    { address: '0x14aeb8cfdf477001a60f5196ec2ddfe94771b794', name: 'CLANKER/ARBME' },
  ],
};

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
  token0: string;
  token1: string;
  liquidity: string; // Human-readable display
  liquidityUsd: number; // USD value (0 if unknown)
  feesEarned: string; // Human-readable display
  feesEarnedUsd: number; // USD value (0 if unknown)
  priceRangeLow?: string; // For V3 positions
  priceRangeHigh?: string; // For V3 positions
  inRange?: boolean; // For V3 positions
  tokenId?: string; // For V3/V4 NFT positions
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
    transport: http(rpcUrl),
  });

  const positions: Position[] = [];

  try {
    // Fetch V2 positions
    const v2Positions = await fetchV2Positions(client, walletAddress as Address);
    positions.push(...v2Positions);

    // Fetch V3 positions
    const v3Positions = await fetchV3Positions(client, walletAddress as Address);
    positions.push(...v3Positions);

    // Fetch V4 positions
    const v4Positions = await fetchV4Positions(client, walletAddress as Address);
    positions.push(...v4Positions);

    // Enrich with token metadata and prices
    await enrichPositionsWithMetadata(positions, alchemyKey);
  } catch (error) {
    console.error('[Positions] Error fetching positions:', error);
  }

  return positions;
}

/**
 * Fetch V2 LP positions
 */
async function fetchV2Positions(client: any, wallet: Address): Promise<Position[]> {
  const positions: Position[] = [];

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
          token0: token0 as string,
          token1: token1 as string,
          liquidity: liquidityDisplay,
          liquidityUsd: 0, // TODO: Calculate from reserves and token prices
          feesEarned: 'N/A',
          feesEarnedUsd: 0,
        });
      }
    } catch (error) {
      console.error(`[Positions] Error fetching V2 pool ${pool.address}:`, error);
    }
  }

  return positions;
}

/**
 * Fetch V3 NFT positions
 */
async function fetchV3Positions(client: any, wallet: Address): Promise<Position[]> {
  const positions: Position[] = [];

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

    // Enumerate positions
    for (let i = 0; i < count; i++) {
      try {
        // Get token ID
        const tokenId = await client.readContract({
          address: V3_POSITION_MANAGER as Address,
          abi: V3_NFT_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [wallet, BigInt(i)],
        });

        // Get position details
        const position = await client.readContract({
          address: V3_POSITION_MANAGER as Address,
          abi: V3_NFT_ABI,
          functionName: 'positions',
          args: [tokenId],
        });

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
        ] = position;

        if (liquidity > 0n) {
          const feePercent = Number(fee) / 10000;

          positions.push({
            id: `v3-${tokenId}`,
            version: 'V3',
            pair: `Token Pair`, // TODO: Get token symbols
            poolAddress: V3_POSITION_MANAGER,
            token0: token0 as string,
            token1: token1 as string,
            liquidity: `${formatUnits(liquidity, 0)} liquidity`,
            liquidityUsd: 0, // TODO: Calculate from tick ranges and token prices
            feesEarned: `${formatUnits(tokensOwed0, 18)} / ${formatUnits(tokensOwed1, 18)}`,
            feesEarnedUsd: 0, // TODO: Calculate from token prices
            priceRangeLow: `Tick ${tickLower}`,
            priceRangeHigh: `Tick ${tickUpper}`,
            inRange: undefined, // TODO: Check current tick vs range
            tokenId: tokenId.toString(),
          });
        }
      } catch (error) {
        console.error(`[Positions] Error fetching V3 position ${i}:`, error);
      }
    }
  } catch (error) {
    console.error('[Positions] Error fetching V3 positions:', error);
  }

  return positions;
}

/**
 * Fetch V4 NFT positions
 */
async function fetchV4Positions(client: any, wallet: Address): Promise<Position[]> {
  const positions: Position[] = [];

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

    // Helper function to extract tick values from bit-packed PositionInfo
    const extractTicks = (packedInfo: bigint): { tickLower: number; tickUpper: number } => {
      // PositionInfo layout: poolId (200 bits) | tickUpper (24 bits) | tickLower (24 bits) | hasSubscriber (8 bits)
      const tickLowerMask = BigInt(0xFFFFFF); // 24 bits
      const tickUpperMask = BigInt(0xFFFFFF) << BigInt(24);

      const tickLowerRaw = Number((packedInfo & tickLowerMask));
      const tickUpperRaw = Number(((packedInfo & tickUpperMask) >> BigInt(24)));

      // Convert from unsigned to signed (int24 range: -8388608 to 8388607)
      const tickLower = tickLowerRaw > 0x7FFFFF ? tickLowerRaw - 0x1000000 : tickLowerRaw;
      const tickUpper = tickUpperRaw > 0x7FFFFF ? tickUpperRaw - 0x1000000 : tickUpperRaw;

      return { tickLower, tickUpper };
    };

    // Enumerate positions
    for (let i = 0; i < count; i++) {
      try {
        // Get token ID
        const tokenId = await client.readContract({
          address: V4_POSITION_MANAGER as Address,
          abi: V4_NFT_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [wallet, BigInt(i)],
        });

        // Get position details
        const [poolKey, packedInfo] = await client.readContract({
          address: V4_POSITION_MANAGER as Address,
          abi: V4_NFT_ABI,
          functionName: 'getPoolAndPositionInfo',
          args: [tokenId],
        });

        // Get liquidity
        const liquidity = await client.readContract({
          address: V4_POSITION_MANAGER as Address,
          abi: V4_NFT_ABI,
          functionName: 'getPositionLiquidity',
          args: [tokenId],
        });

        const { currency0, currency1, fee } = poolKey as any;
        const { tickLower, tickUpper } = extractTicks(packedInfo as bigint);

        if (liquidity > 0n) {
          const feePercent = Number(fee) / 10000;

          positions.push({
            id: `v4-${tokenId}`,
            version: 'V4',
            pair: `Token Pair`, // TODO: Get token symbols
            poolAddress: V4_POSITION_MANAGER,
            token0: currency0 as string,
            token1: currency1 as string,
            liquidity: `${formatUnits(liquidity, 0)} liquidity`,
            liquidityUsd: 0, // TODO: Calculate from tick ranges and token prices
            feesEarned: 'N/A', // TODO: Calculate uncollected fees
            feesEarnedUsd: 0,
            priceRangeLow: `Tick ${tickLower}`,
            priceRangeHigh: `Tick ${tickUpper}`,
            inRange: undefined, // TODO: Check current tick vs range
            tokenId: tokenId.toString(),
          });
        }
      } catch (error) {
        console.error(`[Positions] Error fetching V4 position ${i}:`, error);
      }
    }
  } catch (error) {
    console.error('[Positions] Error fetching V4 positions:', error);
  }

  return positions;
}

/**
 * Enrich positions with token symbols, decimals, and USD values
 */
async function enrichPositionsWithMetadata(
  positions: Position[],
  alchemyKey?: string
): Promise<void> {
  if (positions.length === 0) return;

  // Collect all unique token addresses
  const tokenAddresses = new Set<string>();
  for (const position of positions) {
    tokenAddresses.add(position.token0.toLowerCase());
    tokenAddresses.add(position.token1.toLowerCase());
  }

  console.log(`[Positions] Fetching metadata for ${tokenAddresses.size} tokens...`);

  // Fetch token metadata in parallel
  const metadataPromises = Array.from(tokenAddresses).map((address) =>
    getTokenMetadata(address, alchemyKey)
  );
  const metadataResults = await Promise.all(metadataPromises);

  // Build metadata map
  const metadataMap = new Map<string, { symbol: string; decimals: number }>();
  for (const metadata of metadataResults) {
    metadataMap.set(metadata.address.toLowerCase(), {
      symbol: metadata.symbol,
      decimals: metadata.decimals,
    });
  }

  // Fetch token prices
  const priceMap = await getTokenPrices(Array.from(tokenAddresses));

  // Enrich each position
  for (const position of positions) {
    const token0Meta = metadataMap.get(position.token0.toLowerCase());
    const token1Meta = metadataMap.get(position.token1.toLowerCase());
    const token0Price = priceMap.get(position.token0.toLowerCase()) || 0;
    const token1Price = priceMap.get(position.token1.toLowerCase()) || 0;

    if (token0Meta && token1Meta) {
      // Update pair name with symbols
      position.pair = `${token0Meta.symbol} / ${token1Meta.symbol}`;

      // For V2 positions, we have reserves data - calculate USD value
      // For now, just update the pair name. USD calculation would require fetching reserves.

      // TODO: Calculate actual USD values for V2 positions using reserves
      // TODO: Calculate USD values for V3 positions using liquidity and tick ranges
    }
  }

  console.log(`[Positions] Enriched ${positions.length} positions with metadata`);
}
