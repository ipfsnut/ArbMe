/**
 * Fetch user's Uniswap positions across V2, V3, and V4
 */
import { createPublicClient, http, formatUnits, keccak256 } from 'viem';
import { base } from 'viem/chains';
import { getTokenMetadata, getTokenPrices } from './tokens.js';
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
];
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
];
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
];
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
];
/**
 * Fetch all positions for a wallet address
 */
export async function fetchUserPositions(walletAddress, alchemyKey) {
    const rpcUrl = alchemyKey
        ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : 'https://mainnet.base.org';
    const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
    });
    const positions = [];
    try {
        // Fetch V2 positions
        const v2Positions = await fetchV2Positions(client, walletAddress);
        positions.push(...v2Positions);
        // Fetch V3 positions
        const v3Positions = await fetchV3Positions(client, walletAddress);
        positions.push(...v3Positions);
        // Fetch V4 positions
        const v4Positions = await fetchV4Positions(client, walletAddress, alchemyKey);
        positions.push(...v4Positions);
        // Enrich with token metadata and prices
        await enrichPositionsWithMetadata(positions, alchemyKey);
        // Sort by TVL descending (highest value first)
        positions.sort((a, b) => b.liquidityUsd - a.liquidityUsd);
    }
    catch (error) {
        console.error('[Positions] Error fetching positions:', error);
    }
    return positions;
}
/**
 * Fetch V2 LP positions
 */
async function fetchV2Positions(client, wallet) {
    const positions = [];
    for (const pool of KNOWN_POOLS.V2) {
        try {
            const balance = await client.readContract({
                address: pool.address,
                abi: V2_PAIR_ABI,
                functionName: 'balanceOf',
                args: [wallet],
            });
            if (balance > 0n) {
                // Get pool details
                const [totalSupply, reserves, token0, token1] = await Promise.all([
                    client.readContract({
                        address: pool.address,
                        abi: V2_PAIR_ABI,
                        functionName: 'totalSupply',
                    }),
                    client.readContract({
                        address: pool.address,
                        abi: V2_PAIR_ABI,
                        functionName: 'getReserves',
                    }),
                    client.readContract({
                        address: pool.address,
                        abi: V2_PAIR_ABI,
                        functionName: 'token0',
                    }),
                    client.readContract({
                        address: pool.address,
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
                    token0: token0,
                    token1: token1,
                    liquidity: liquidityDisplay,
                    liquidityUsd: 0, // Will be calculated in enrichment
                    feesEarned: 'N/A',
                    feesEarnedUsd: 0,
                    // Store V2 data for USD calculation
                    v2Balance: balance,
                    v2TotalSupply: totalSupply,
                    v2Reserve0: reserves[0],
                    v2Reserve1: reserves[1],
                });
            }
        }
        catch (error) {
            console.error(`[Positions] Error fetching V2 pool ${pool.address}:`, error);
        }
    }
    return positions;
}
/**
 * Fetch V3 NFT positions
 */
async function fetchV3Positions(client, wallet) {
    const positions = [];
    try {
        // Get number of V3 positions
        const balance = await client.readContract({
            address: V3_POSITION_MANAGER,
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
                    address: V3_POSITION_MANAGER,
                    abi: V3_NFT_ABI,
                    functionName: 'tokenOfOwnerByIndex',
                    args: [wallet, BigInt(i)],
                });
                // Get position details
                const position = await client.readContract({
                    address: V3_POSITION_MANAGER,
                    abi: V3_NFT_ABI,
                    functionName: 'positions',
                    args: [tokenId],
                });
                const [nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128, tokensOwed0, tokensOwed1,] = position;
                if (liquidity > 0n) {
                    positions.push({
                        id: `v3-${tokenId}`,
                        version: 'V3',
                        pair: `Token Pair`, // TODO: Get token symbols
                        poolAddress: V3_POSITION_MANAGER,
                        token0: token0,
                        token1: token1,
                        liquidity: `${formatUnits(liquidity, 0)} liquidity`,
                        liquidityUsd: 0, // Will be calculated in enrichment
                        feesEarned: `${formatUnits(tokensOwed0, 18)} / ${formatUnits(tokensOwed1, 18)}`,
                        feesEarnedUsd: 0, // Will be calculated in enrichment
                        priceRangeLow: `Tick ${tickLower}`,
                        priceRangeHigh: `Tick ${tickUpper}`,
                        inRange: undefined, // TODO: Check current tick vs range
                        tokenId: tokenId.toString(),
                        fee: Number(fee),
                    });
                }
            }
            catch (error) {
                console.error(`[Positions] Error fetching V3 position ${i}:`, error);
            }
        }
    }
    catch (error) {
        console.error('[Positions] Error fetching V3 positions:', error);
    }
    return positions;
}
/**
 * Fetch V4 NFT positions
 * Note: V4 Position Manager does not implement ERC721Enumerable, so we use Alchemy NFT API
 */
async function fetchV4Positions(client, wallet, alchemyKey) {
    const positions = [];
    try {
        // Get number of V4 positions
        const balance = await client.readContract({
            address: V4_POSITION_MANAGER,
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
        let ownedTokenIds = [];
        if (alchemyKey) {
            try {
                const alchemyUrl = `https://base-mainnet.g.alchemy.com/nft/v3/${alchemyKey}/getNFTsForOwner?owner=${wallet}&contractAddresses[]=${V4_POSITION_MANAGER}&withMetadata=false`;
                const response = await fetch(alchemyUrl);
                const data = await response.json();
                ownedTokenIds = data.ownedNfts?.map((nft) => nft.tokenId) || [];
                console.log(`[Positions] Found ${ownedTokenIds.length} V4 token IDs via Alchemy NFT API`);
            }
            catch (error) {
                console.error('[Positions] Alchemy NFT API failed, skipping V4 positions:', error);
                return positions;
            }
        }
        else {
            console.log('[Positions] No Alchemy key provided, skipping V4 position enumeration');
            return positions;
        }
        // Helper function to extract tick values from bit-packed PositionInfo
        const extractTicks = (packedInfo) => {
            // PositionInfo layout: poolId (200 bits) | tickUpper (24 bits) | tickLower (24 bits) | hasSubscriber (8 bits)
            // Extract from right to left: hasSubscriber (first 8 bits), tickLower (next 24), tickUpper (next 24)
            const lowerMask = BigInt(0xFFFFFF); // 24 bits
            const upperMask = BigInt(0xFFFFFF) << BigInt(24);
            const tickLowerRaw = Number((packedInfo & lowerMask));
            const tickUpperRaw = Number(((packedInfo & upperMask) >> BigInt(24)));
            // Convert from unsigned to signed (int24 range: -8388608 to 8388607)
            const tickLower = tickLowerRaw > 0x7FFFFF ? tickLowerRaw - 0x1000000 : tickLowerRaw;
            const tickUpper = tickUpperRaw > 0x7FFFFF ? tickUpperRaw - 0x1000000 : tickUpperRaw;
            // IMPORTANT: Return them swapped because the layout is tickUpper-then-tickLower
            return { tickLower: tickUpper, tickUpper: tickLower };
        };
        // Fetch details for each owned position
        for (const tokenIdStr of ownedTokenIds) {
            try {
                // Alchemy returns hex tokenIds, convert to BigInt
                const tokenId = BigInt(tokenIdStr);
                // Get position details
                const [poolKey, packedInfo] = await client.readContract({
                    address: V4_POSITION_MANAGER,
                    abi: V4_NFT_ABI,
                    functionName: 'getPoolAndPositionInfo',
                    args: [tokenId],
                });
                // Get liquidity
                const liquidity = await client.readContract({
                    address: V4_POSITION_MANAGER,
                    abi: V4_NFT_ABI,
                    functionName: 'getPositionLiquidity',
                    args: [tokenId],
                });
                const { currency0, currency1, fee, tickSpacing, hooks } = poolKey;
                const { tickLower, tickUpper } = extractTicks(packedInfo);
                if (liquidity > 0n) {
                    positions.push({
                        id: `v4-${tokenId}`,
                        version: 'V4',
                        pair: `Token Pair`, // TODO: Get token symbols
                        poolAddress: V4_POSITION_MANAGER,
                        token0: currency0,
                        token1: currency1,
                        liquidity: `${formatUnits(liquidity, 0)} liquidity`,
                        liquidityUsd: 0, // Will be calculated in enrichment
                        feesEarned: 'N/A', // TODO: Calculate uncollected fees
                        feesEarnedUsd: 0,
                        priceRangeLow: `Tick ${tickLower}`,
                        priceRangeHigh: `Tick ${tickUpper}`,
                        inRange: undefined, // TODO: Check current tick vs range
                        tokenId: tokenId.toString(),
                        fee: Number(fee),
                        tickSpacing: Number(tickSpacing),
                        hooks: hooks,
                    });
                }
            }
            catch (error) {
                console.error(`[Positions] Error fetching V4 position ${tokenIdStr}:`, error);
            }
        }
    }
    catch (error) {
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
function tickToSqrtPriceX96(tick) {
    const sqrtRatio = Math.sqrt(Math.pow(1.0001, tick));
    return BigInt(Math.floor(sqrtRatio * Math.pow(2, 96)));
}
/**
 * Calculate token amounts from liquidity and price range
 */
function calculateAmountsFromLiquidity(sqrtPriceX96, sqrtPriceLower, sqrtPriceUpper, liquidity) {
    const sqrtP = sqrtPriceX96;
    const sqrtPL = sqrtPriceLower;
    const sqrtPU = sqrtPriceUpper;
    const L = liquidity;
    let amount0 = BigInt(0);
    let amount1 = BigInt(0);
    if (sqrtP <= sqrtPL) {
        // Current price below range - all token0
        amount0 = (L * Q96 * (sqrtPU - sqrtPL)) / (sqrtPL * sqrtPU);
    }
    else if (sqrtP >= sqrtPU) {
        // Current price above range - all token1
        amount1 = (L * (sqrtPU - sqrtPL)) / Q96;
    }
    else {
        // Current price in range - mix of both
        amount0 = (L * Q96 * (sqrtPU - sqrtP)) / (sqrtP * sqrtPU);
        amount1 = (L * (sqrtP - sqrtPL)) / Q96;
    }
    return { amount0, amount1 };
}
/**
 * Enrich positions with token symbols, decimals, and USD values
 */
async function enrichPositionsWithMetadata(positions, alchemyKey) {
    if (positions.length === 0)
        return;
    // Collect all unique token addresses
    const tokenAddresses = new Set();
    for (const position of positions) {
        tokenAddresses.add(position.token0.toLowerCase());
        tokenAddresses.add(position.token1.toLowerCase());
    }
    console.log(`[Positions] Fetching metadata for ${tokenAddresses.size} tokens...`);
    // Fetch token metadata in parallel
    const metadataPromises = Array.from(tokenAddresses).map((address) => getTokenMetadata(address, alchemyKey));
    const metadataResults = await Promise.all(metadataPromises);
    // Build metadata map
    const metadataMap = new Map();
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
            // Calculate USD values for V2 positions
            if (position.version === 'V2' && position.v2Balance && position.v2TotalSupply && position.v2Reserve0 && position.v2Reserve1) {
                enrichV2Position(position, token0Meta.decimals, token1Meta.decimals, token0Price, token1Price);
            }
            // Calculate USD values for V3/V4 positions
            if ((position.version === 'V3' || position.version === 'V4') && position.fee !== undefined) {
                await enrichConcentratedLiquidityPosition(position, token0Meta.decimals, token1Meta.decimals, token0Price, token1Price, alchemyKey);
            }
            // Calculate uncollected fees for V4 positions
            if (position.version === 'V4' && position.tokenId && position.fee !== undefined && position.tickSpacing !== undefined && position.hooks) {
                await enrichV4Fees(position, token0Meta.decimals, token1Meta.decimals, token0Price, token1Price, alchemyKey);
            }
        }
    }
    console.log(`[Positions] Enriched ${positions.length} positions with metadata`);
}
/**
 * Enrich V2 position with USD values calculated from reserves
 */
function enrichV2Position(position, decimals0, decimals1, price0, price1) {
    if (!position.v2Balance || !position.v2TotalSupply || !position.v2Reserve0 || !position.v2Reserve1) {
        return;
    }
    try {
        // Calculate user's share of the pool
        const shareRatio = Number(position.v2Balance) / Number(position.v2TotalSupply);
        // Calculate user's token amounts
        const userAmount0 = Number(position.v2Reserve0) * shareRatio;
        const userAmount1 = Number(position.v2Reserve1) * shareRatio;
        // Convert to human-readable amounts
        const token0Amount = userAmount0 / Math.pow(10, decimals0);
        const token1Amount = userAmount1 / Math.pow(10, decimals1);
        // Calculate USD values
        const amount0Usd = token0Amount * price0;
        const amount1Usd = token1Amount * price1;
        const totalUsd = amount0Usd + amount1Usd;
        // Update position
        position.liquidityUsd = totalUsd;
        position.liquidity = `${token0Amount.toFixed(6)} / ${token1Amount.toFixed(6)}`;
        console.log(`[Positions] V2 ${position.id}: $${totalUsd.toFixed(2)} (${token0Amount.toFixed(4)} + ${token1Amount.toFixed(4)})`);
    }
    catch (error) {
        console.error(`[Positions] Error calculating V2 amounts for ${position.id}:`, error);
    }
}
/**
 * Enrich V3/V4 position with calculated amounts and USD values
 */
async function enrichConcentratedLiquidityPosition(position, decimals0, decimals1, price0, price1, alchemyKey) {
    // Extract tick range from position (already parsed in fetch functions)
    const tickLower = extractTickFromString(position.priceRangeLow);
    const tickUpper = extractTickFromString(position.priceRangeHigh);
    if (tickLower === null || tickUpper === null) {
        console.warn(`[Positions] Cannot calculate amounts - invalid ticks for position ${position.id}`);
        return;
    }
    // Fetch current pool price (sqrtPriceX96) and tick
    const slot0Data = await fetchPoolSqrtPrice(position, alchemyKey);
    if (!slot0Data) {
        console.warn(`[Positions] Cannot fetch pool price for position ${position.id}`);
        return;
    }
    const { sqrtPriceX96, tick: currentTick } = slot0Data;
    // Calculate inRange status
    const inRange = currentTick >= tickLower && currentTick <= tickUpper;
    position.inRange = inRange;
    // Calculate token amounts from liquidity
    try {
        const liquidity = BigInt(position.liquidity.replace(/[^\d]/g, '')); // Extract numeric part
        const sqrtPriceLower = tickToSqrtPriceX96(tickLower);
        const sqrtPriceUpper = tickToSqrtPriceX96(tickUpper);
        const { amount0, amount1 } = calculateAmountsFromLiquidity(sqrtPriceX96, sqrtPriceLower, sqrtPriceUpper, liquidity);
        // Convert to human-readable amounts
        const token0Amount = Number(amount0) / Math.pow(10, decimals0);
        const token1Amount = Number(amount1) / Math.pow(10, decimals1);
        // Calculate USD values
        const amount0Usd = token0Amount * price0;
        const amount1Usd = token1Amount * price1;
        const totalUsd = amount0Usd + amount1Usd;
        // Update position with calculated values
        position.liquidityUsd = totalUsd;
        position.liquidity = `${token0Amount.toFixed(6)} / ${token1Amount.toFixed(6)}`;
        console.log(`[Positions] Calculated ${position.id}: $${totalUsd.toFixed(2)} (${token0Amount.toFixed(4)} + ${token1Amount.toFixed(4)}) - ${inRange ? 'IN RANGE' : 'OUT OF RANGE'}`);
    }
    catch (error) {
        console.error(`[Positions] Error calculating amounts for ${position.id}:`, error);
    }
}
/**
 * Enrich V4 position with uncollected fees
 */
async function enrichV4Fees(position, decimals0, decimals1, price0, price1, alchemyKey) {
    if (!position.tokenId || !position.fee || !position.tickSpacing || !position.hooks) {
        return;
    }
    const tickLower = extractTickFromString(position.priceRangeLow);
    const tickUpper = extractTickFromString(position.priceRangeHigh);
    if (tickLower === null || tickUpper === null) {
        console.warn(`[Positions] Cannot calculate fees - invalid ticks for position ${position.id}`);
        return;
    }
    const rpcUrl = alchemyKey
        ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : 'https://mainnet.base.org';
    const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
    });
    try {
        // Calculate pool ID and position ID
        const poolId = calculateV4PoolId(position.token0, position.token1, position.fee, position.tickSpacing, position.hooks);
        const positionId = calculateV4PositionId(V4_POSITION_MANAGER, tickLower, tickUpper, position.tokenId);
        // Fetch fee growth inside the tick range
        const [feeGrowthInside0, feeGrowthInside1] = await client.readContract({
            address: V4_STATE_VIEW,
            abi: V4_STATE_VIEW_ABI,
            functionName: 'getFeeGrowthInside',
            args: [poolId, tickLower, tickUpper],
        });
        // Fetch position info (liquidity, last fee growth)
        const [posLiquidity, feeGrowthInside0Last, feeGrowthInside1Last] = await client.readContract({
            address: V4_STATE_VIEW,
            abi: V4_STATE_VIEW_ABI,
            functionName: 'getPositionInfo',
            args: [poolId, positionId],
        });
        // Use on-chain liquidity for accurate fee calculation
        const liquidity = BigInt(position.liquidity.replace(/[^\d]/g, ''));
        const actualLiquidity = posLiquidity > BigInt(0) ? posLiquidity : liquidity;
        // Calculate fees: (feeGrowthCurrent - feeGrowthLast) * liquidity / 2^128
        const Q128 = BigInt(2) ** BigInt(128);
        const feeGrowthDelta0 = feeGrowthInside0 >= feeGrowthInside0Last
            ? feeGrowthInside0 - feeGrowthInside0Last
            : BigInt(0);
        const feeGrowthDelta1 = feeGrowthInside1 >= feeGrowthInside1Last
            ? feeGrowthInside1 - feeGrowthInside1Last
            : BigInt(0);
        const fees0Raw = (feeGrowthDelta0 * actualLiquidity) / Q128;
        const fees1Raw = (feeGrowthDelta1 * actualLiquidity) / Q128;
        // Convert to human-readable amounts
        const fees0 = Number(fees0Raw) / Math.pow(10, decimals0);
        const fees1 = Number(fees1Raw) / Math.pow(10, decimals1);
        // Calculate USD values
        const fees0Usd = fees0 * price0;
        const fees1Usd = fees1 * price1;
        const totalFeesUsd = fees0Usd + fees1Usd;
        // Update position
        position.feesEarned = `${fees0.toFixed(6)} / ${fees1.toFixed(6)}`;
        position.feesEarnedUsd = totalFeesUsd;
        console.log(`[Positions] V4 fees ${position.id}: $${totalFeesUsd.toFixed(2)} (${fees0.toFixed(6)} + ${fees1.toFixed(6)})`);
    }
    catch (error) {
        console.error(`[Positions] Error calculating V4 fees for ${position.id}:`, error);
    }
}
/**
 * Extract tick number from tick string (e.g., "Tick -276320" -> -276320)
 */
function extractTickFromString(tickStr) {
    if (!tickStr)
        return null;
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
];
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
];
// V4 StateView ABI (getSlot0, getFeeGrowthInside, getPositionInfo)
const V4_STATE_VIEW_ABI = [
    {
        name: 'getSlot0',
        type: 'function',
        stateMutability: 'view',
        inputs: [
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
];
const V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const V4_STATE_VIEW = '0x30654c69b7b07645c04576e0fa787c25d66be07c';
// Helper to calculate V4 pool ID
function calculateV4PoolId(currency0, currency1, fee, tickSpacing, hooks) {
    const poolKeyEncoded = currency0.slice(2).toLowerCase().padStart(64, '0') +
        currency1.slice(2).toLowerCase().padStart(64, '0') +
        fee.toString(16).padStart(64, '0') +
        tickSpacing.toString(16).padStart(64, '0') +
        hooks.slice(2).toLowerCase().padStart(64, '0');
    return keccak256(`0x${poolKeyEncoded}`);
}
// Helper to encode int24 for position ID calculation
function encodeInt24(val) {
    if (val < 0) {
        // Two's complement for negative numbers
        const twosComp = (1 << 24) + val;
        return twosComp.toString(16).padStart(6, '0');
    }
    return val.toString(16).padStart(6, '0');
}
// Helper to calculate V4 position ID
function calculateV4PositionId(positionManager, tickLower, tickUpper, tokenId) {
    const positionIdInput = positionManager.slice(2).toLowerCase() +
        encodeInt24(tickLower) +
        encodeInt24(tickUpper) +
        BigInt(tokenId).toString(16).padStart(64, '0');
    return keccak256(`0x${positionIdInput}`);
}
/**
 * Fetch current sqrtPriceX96 and tick for a pool
 */
async function fetchPoolSqrtPrice(position, alchemyKey) {
    const rpcUrl = alchemyKey
        ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : 'https://mainnet.base.org';
    const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
    });
    try {
        if (position.version === 'V3' && position.fee) {
            // For V3, find the pool using the fee tier we know from the position
            const poolAddress = await client.readContract({
                address: V3_FACTORY,
                abi: V3_FACTORY_ABI,
                functionName: 'getPool',
                args: [position.token0, position.token1, position.fee],
            });
            if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
                const slot0 = await client.readContract({
                    address: poolAddress,
                    abi: V3_POOL_ABI,
                    functionName: 'slot0',
                });
                return {
                    sqrtPriceX96: slot0[0],
                    tick: Number(slot0[1]),
                };
            }
            console.warn(`[Positions] V3 pool not found for ${position.token0}/${position.token1} fee=${position.fee}`);
            return null;
        }
        else if (position.version === 'V4' && position.fee !== undefined && position.tickSpacing !== undefined && position.hooks) {
            // V4 - use StateView to get slot0
            const poolKey = {
                currency0: position.token0,
                currency1: position.token1,
                fee: position.fee,
                tickSpacing: position.tickSpacing,
                hooks: position.hooks,
            };
            const slot0 = await client.readContract({
                address: V4_STATE_VIEW,
                abi: V4_STATE_VIEW_ABI,
                functionName: 'getSlot0',
                args: [poolKey],
            });
            return {
                sqrtPriceX96: slot0[0],
                tick: Number(slot0[1]),
            };
        }
        console.warn(`[Positions] Missing pool parameters for ${position.version} position ${position.id}`);
        return null;
    }
    catch (error) {
        console.error(`[Positions] Error fetching slot0 for ${position.version} pool:`, error);
        return null;
    }
}
