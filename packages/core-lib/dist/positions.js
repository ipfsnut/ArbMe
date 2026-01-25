/**
 * Fetch user's Uniswap positions across V2, V3, and V4
 */
import { createPublicClient, http, formatUnits, keccak256 } from 'viem';
import { base } from 'viem/chains';
import { getTokenMetadata, getTokenPrices } from './tokens.js';
import { getTokenPricesOnChain } from './pricing.js';
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
    const rawPositions = [];
    console.log(`[Positions] Fetching positions for wallet: ${walletAddress}`);
    try {
        // Fetch V2 positions
        const v2Positions = await fetchV2Positions(client, walletAddress);
        console.log(`[Positions] Found ${v2Positions.length} V2 positions`);
        rawPositions.push(...v2Positions);
        // Fetch V3 positions
        const v3Positions = await fetchV3Positions(client, walletAddress);
        rawPositions.push(...v3Positions);
        // Fetch V4 positions
        const v4Positions = await fetchV4Positions(client, walletAddress, alchemyKey);
        rawPositions.push(...v4Positions);
        // Enrich with token metadata and prices, converting to final Position type
        const positions = await enrichPositionsWithMetadata(rawPositions, alchemyKey);
        // Sort by TVL descending (highest value first)
        positions.sort((a, b) => b.liquidityUsd - a.liquidityUsd);
        return positions;
    }
    catch (error) {
        console.error('[Positions] Error fetching positions:', error);
        return [];
    }
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
                    token0Address: token0,
                    token1Address: token1,
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
                        pair: `Token Pair`, // Will be updated in enrichment
                        poolAddress: V3_POSITION_MANAGER,
                        token0Address: token0,
                        token1Address: token1,
                        liquidity: `${formatUnits(liquidity, 0)} liquidity`,
                        liquidityUsd: 0, // Will be calculated in enrichment
                        feesEarned: `${formatUnits(tokensOwed0, 18)} / ${formatUnits(tokensOwed1, 18)}`,
                        feesEarnedUsd: 0, // Will be calculated in enrichment
                        priceRangeLow: `Tick ${tickLower}`,
                        priceRangeHigh: `Tick ${tickUpper}`,
                        inRange: undefined, // Will be calculated in enrichment
                        tokenId: tokenId.toString(),
                        fee: Number(fee),
                        // Store raw values for fee USD calculation
                        v3TokensOwed0: tokensOwed0,
                        v3TokensOwed1: tokensOwed1,
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
                        pair: `Token Pair`, // Will be updated in enrichment
                        poolAddress: V4_POSITION_MANAGER,
                        token0Address: currency0,
                        token1Address: currency1,
                        liquidity: `${formatUnits(liquidity, 0)} liquidity`,
                        liquidityUsd: 0, // Will be calculated in enrichment
                        feesEarned: 'N/A', // Will be calculated in enrichment
                        feesEarnedUsd: 0,
                        priceRangeLow: `Tick ${tickLower}`,
                        priceRangeHigh: `Tick ${tickUpper}`,
                        inRange: undefined, // Will be calculated in enrichment
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
 * Transforms RawPosition[] to Position[]
 */
async function enrichPositionsWithMetadata(rawPositions, alchemyKey) {
    console.log(`[Positions] ═════ ENRICHMENT STARTED ═════`);
    console.log(`[Positions] Positions to enrich: ${rawPositions.length}`);
    console.log(`[Positions] Alchemy key present: ${!!alchemyKey}`);
    if (rawPositions.length === 0)
        return [];
    // Collect all unique token addresses
    const tokenAddresses = new Set();
    for (const position of rawPositions) {
        tokenAddresses.add(position.token0Address.toLowerCase());
        tokenAddresses.add(position.token1Address.toLowerCase());
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
    // Fetch token prices using on-chain pricing (with GeckoTerminal as fallback)
    const tokensWithDecimals = Array.from(tokenAddresses).map(address => ({
        address,
        decimals: metadataMap.get(address)?.decimals || 18,
    }));
    console.log(`[Positions] Fetching on-chain prices for tokens...`);
    const onChainPrices = await getTokenPricesOnChain(tokensWithDecimals, alchemyKey);
    // If on-chain pricing fails or returns few prices, fallback to GeckoTerminal
    const priceMap = new Map();
    if (onChainPrices.size < tokenAddresses.size * 0.5) {
        console.log(`[Positions] On-chain pricing returned only ${onChainPrices.size}/${tokenAddresses.size} prices, falling back to GeckoTerminal`);
        const geckoterminPrices = await getTokenPrices(Array.from(tokenAddresses));
        // Merge: prefer on-chain, fallback to GeckoTerminal
        for (const address of tokenAddresses) {
            const onChainPrice = onChainPrices.get(address);
            const geckoPrice = geckoterminPrices.get(address);
            priceMap.set(address, onChainPrice || geckoPrice || 0);
        }
    }
    else {
        // On-chain pricing worked well, use it
        console.log(`[Positions] On-chain pricing successful: ${onChainPrices.size}/${tokenAddresses.size} prices`);
        for (const address of tokenAddresses) {
            priceMap.set(address, onChainPrices.get(address) || 0);
        }
    }
    // Transform each raw position to final Position
    const positions = [];
    for (const raw of rawPositions) {
        try {
            const token0Meta = metadataMap.get(raw.token0Address.toLowerCase());
            const token1Meta = metadataMap.get(raw.token1Address.toLowerCase());
            const token0Price = priceMap.get(raw.token0Address.toLowerCase()) || 0;
            const token1Price = priceMap.get(raw.token1Address.toLowerCase()) || 0;
            console.log(`[Positions] Enriching ${raw.id}: token0=${token0Meta?.symbol} ($${token0Price}), token1=${token1Meta?.symbol} ($${token1Price})`);
            // Calculate enrichment data
            const enrichmentData = {
                token0Amount: 0,
                token1Amount: 0,
                liquidityUsd: 0,
                feesEarnedUsd: raw.feesEarnedUsd,
                feesEarned: raw.feesEarned,
                inRange: raw.inRange,
            };
            if (token0Meta && token1Meta) {
                // Calculate USD values for V2 positions
                if (raw.version === 'V2' && raw.v2Balance && raw.v2TotalSupply && raw.v2Reserve0 && raw.v2Reserve1) {
                    console.log(`[Positions] → Calculating V2 amounts for ${raw.id}`);
                    const v2Data = calculateV2Amounts(raw, token0Meta.decimals, token1Meta.decimals, token0Price, token1Price);
                    Object.assign(enrichmentData, v2Data);
                }
                // Calculate USD values for V3/V4 positions
                if ((raw.version === 'V3' || raw.version === 'V4') && raw.fee !== undefined) {
                    console.log(`[Positions] → Calculating concentrated liquidity amounts for ${raw.id}`);
                    const clData = await calculateConcentratedLiquidityAmounts(raw, token0Meta.decimals, token1Meta.decimals, token0Price, token1Price, alchemyKey);
                    Object.assign(enrichmentData, clData);
                    // Calculate V3 fees
                    if (raw.version === 'V3' && raw.v3TokensOwed0 !== undefined && raw.v3TokensOwed1 !== undefined) {
                        const fees0 = Number(raw.v3TokensOwed0) / Math.pow(10, token0Meta.decimals);
                        const fees1 = Number(raw.v3TokensOwed1) / Math.pow(10, token1Meta.decimals);
                        enrichmentData.feesEarnedUsd = fees0 * token0Price + fees1 * token1Price;
                        enrichmentData.feesEarned = `${fees0.toFixed(6)} / ${fees1.toFixed(6)}`;
                    }
                }
                // Calculate uncollected fees for V4 positions
                if (raw.version === 'V4' && raw.tokenId && raw.fee !== undefined && raw.tickSpacing !== undefined && raw.hooks) {
                    console.log(`[Positions] → Calculating V4 fees for ${raw.id}`);
                    const v4Fees = await calculateV4Fees(raw, token0Meta.decimals, token1Meta.decimals, token0Price, token1Price, alchemyKey);
                    enrichmentData.feesEarnedUsd = v4Fees.feesEarnedUsd;
                    enrichmentData.feesEarned = v4Fees.feesEarned;
                }
            }
            else {
                console.warn(`[Positions] ⚠️  Missing metadata for ${raw.id}: token0Meta=${!!token0Meta}, token1Meta=${!!token1Meta}`);
            }
            // Build the final Position object
            const position = {
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
            };
            positions.push(position);
        }
        catch (error) {
            console.error(`[Positions] Error enriching position ${raw.id}:`, error);
            // Continue with other positions instead of failing completely
        }
    }
    console.log(`[Positions] Enriched ${positions.length} positions with metadata`);
    return positions;
}
/**
 * Calculate V2 position amounts and USD values
 */
function calculateV2Amounts(raw, decimals0, decimals1, price0, price1) {
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
        console.log(`[Positions] V2 ${raw.id}: $${totalUsd.toFixed(2)} (${token0Amount.toFixed(4)} + ${token1Amount.toFixed(4)})`);
        return {
            token0Amount,
            token1Amount,
            liquidityUsd: totalUsd,
        };
    }
    catch (error) {
        console.error(`[Positions] Error calculating V2 amounts for ${raw.id}:`, error);
        return {};
    }
}
/**
 * Calculate V3/V4 position amounts and USD values
 */
async function calculateConcentratedLiquidityAmounts(raw, decimals0, decimals1, price0, price1, alchemyKey) {
    // Extract tick range from position (already parsed in fetch functions)
    const tickLower = extractTickFromString(raw.priceRangeLow);
    const tickUpper = extractTickFromString(raw.priceRangeHigh);
    if (tickLower === null || tickUpper === null) {
        console.warn(`[Positions] Cannot calculate amounts - invalid ticks for position ${raw.id}`);
        return {};
    }
    // Validate ticks are within Uniswap's valid range (-887272 to 887272)
    if (tickLower < -887272 || tickLower > 887272 || tickUpper < -887272 || tickUpper > 887272) {
        console.warn(`[Positions] Tick out of range for ${raw.id}: tickLower=${tickLower}, tickUpper=${tickUpper}`);
        return { token0Amount: 0, token1Amount: 0, liquidityUsd: 0 };
    }
    // Fetch current pool price (sqrtPriceX96) and tick
    const slot0Data = await fetchPoolSqrtPriceForRaw(raw, alchemyKey);
    if (!slot0Data) {
        console.warn(`[Positions] Cannot fetch pool price for position ${raw.id}, deriving from token prices`);
        // Derive pool price from USD prices: poolPrice = price0 / price1 (token1 per token0)
        if (price0 > 0 && price1 > 0) {
            const derivedPrice = price0 / price1;
            // Validate derived price is a finite, positive number
            if (!isFinite(derivedPrice) || derivedPrice <= 0) {
                console.warn(`[Positions] Invalid derived price for ${raw.id}: ${derivedPrice}`);
                return { token0Amount: 0, token1Amount: 0, liquidityUsd: 0 };
            }
            const derivedTick = Math.round(Math.log(derivedPrice) / Math.log(1.0001));
            // Validate tick is finite and within reasonable bounds
            if (!isFinite(derivedTick) || derivedTick < -887272 || derivedTick > 887272) {
                console.warn(`[Positions] Invalid derived tick for ${raw.id}: ${derivedTick}`);
                return { token0Amount: 0, token1Amount: 0, liquidityUsd: 0 };
            }
            const derivedSqrtPriceX96 = tickToSqrtPriceX96(derivedTick);
            // Use derived price for calculation
            const liquidity = BigInt(raw.liquidity.replace(/[^\d]/g, ''));
            const sqrtPriceLower = tickToSqrtPriceX96(tickLower);
            const sqrtPriceUpper = tickToSqrtPriceX96(tickUpper);
            const { amount0, amount1 } = calculateAmountsFromLiquidity(derivedSqrtPriceX96, sqrtPriceLower, sqrtPriceUpper, liquidity);
            const token0Amount = Number(amount0) / Math.pow(10, decimals0);
            const token1Amount = Number(amount1) / Math.pow(10, decimals1);
            const totalUsd = token0Amount * price0 + token1Amount * price1;
            const inRange = derivedTick >= tickLower && derivedTick <= tickUpper;
            console.log(`[Positions] Derived ${raw.id}: $${totalUsd.toFixed(2)} from token prices`);
            return {
                token0Amount,
                token1Amount,
                liquidityUsd: totalUsd,
                inRange,
                priceRange: {
                    min: Math.pow(1.0001, tickLower),
                    max: Math.pow(1.0001, tickUpper),
                },
            };
        }
        return { token0Amount: 0, token1Amount: 0, liquidityUsd: 0 };
    }
    const { sqrtPriceX96, tick: currentTick } = slot0Data;
    // Calculate inRange status
    const inRange = currentTick >= tickLower && currentTick <= tickUpper;
    // Calculate price range as numbers
    const priceRange = {
        min: Math.pow(1.0001, tickLower),
        max: Math.pow(1.0001, tickUpper),
    };
    // Calculate token amounts from liquidity
    try {
        const liquidity = BigInt(raw.liquidity.replace(/[^\d]/g, '')); // Extract numeric part
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
        console.log(`[Positions] Calculated ${raw.id}: $${totalUsd.toFixed(2)} (${token0Amount.toFixed(4)} + ${token1Amount.toFixed(4)}) - ${inRange ? 'IN RANGE' : 'OUT OF RANGE'}`);
        return {
            token0Amount,
            token1Amount,
            liquidityUsd: totalUsd,
            inRange,
            priceRange,
        };
    }
    catch (error) {
        console.error(`[Positions] Error calculating amounts for ${raw.id}:`, error);
        return { inRange, priceRange };
    }
}
/**
 * Calculate V4 position uncollected fees
 */
async function calculateV4Fees(raw, decimals0, decimals1, price0, price1, alchemyKey) {
    // Add validation at start with detailed logging
    if (!raw.tokenId || !raw.fee || !raw.tickSpacing || !raw.hooks) {
        console.warn(`[Positions] Missing V4 data for ${raw.id}`, {
            tokenId: !!raw.tokenId,
            fee: raw.fee,
            tickSpacing: raw.tickSpacing,
            hooks: !!raw.hooks
        });
        return { feesEarnedUsd: 0, feesEarned: 'N/A' };
    }
    const tickLower = extractTickFromString(raw.priceRangeLow);
    const tickUpper = extractTickFromString(raw.priceRangeHigh);
    if (tickLower === null || tickUpper === null) {
        console.warn(`[Positions] Cannot calculate fees - invalid ticks for position ${raw.id}`, {
            priceRangeLow: raw.priceRangeLow,
            priceRangeHigh: raw.priceRangeHigh,
        });
        return { feesEarnedUsd: 0, feesEarned: 'N/A' };
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
        const poolId = calculateV4PoolId(raw.token0Address, raw.token1Address, raw.fee, raw.tickSpacing, raw.hooks);
        console.log(`[Positions] Calculated pool ID for ${raw.id}:`, {
            poolId: poolId.slice(0, 10) + '...',
            fee: raw.fee,
            tickSpacing: raw.tickSpacing,
        });
        const positionId = calculateV4PositionId(V4_POSITION_MANAGER, tickLower, tickUpper, raw.tokenId);
        console.log(`[Positions] Calculated position ID:`, {
            positionId: positionId.slice(0, 10) + '...',
            manager: V4_POSITION_MANAGER,
            tickLower: tickLower,
            tickUpper: tickUpper,
            tokenId: raw.tokenId,
        });
        // Fetch fee growth inside the tick range
        const [feeGrowthInside0, feeGrowthInside1] = await client.readContract({
            address: V4_STATE_VIEW,
            abi: V4_STATE_VIEW_ABI,
            functionName: 'getFeeGrowthInside',
            args: [poolId, tickLower, tickUpper],
        });
        console.log(`[Positions] Fetched fee growth for ${raw.id}:`, {
            feeGrowthInside0: feeGrowthInside0.toString(),
            feeGrowthInside1: feeGrowthInside1.toString(),
        });
        // Fetch position info (liquidity, last fee growth)
        const [posLiquidity, feeGrowthInside0Last, feeGrowthInside1Last] = await client.readContract({
            address: V4_STATE_VIEW,
            abi: V4_STATE_VIEW_ABI,
            functionName: 'getPositionInfo',
            args: [poolId, positionId],
        });
        console.log(`[Positions] Successfully fetched V4 fee data for ${raw.id}:`, {
            feeGrowth0: feeGrowthInside0.toString(),
            feeGrowth1: feeGrowthInside1.toString(),
            feeGrowth0Last: feeGrowthInside0Last.toString(),
            feeGrowth1Last: feeGrowthInside1Last.toString(),
            liquidity: posLiquidity.toString(),
        });
        // Use on-chain liquidity for accurate fee calculation
        const liquidity = BigInt(raw.liquidity.replace(/[^\d]/g, ''));
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
        console.log(`[Positions] V4 fees ${raw.id}: $${totalFeesUsd.toFixed(2)} (${fees0.toFixed(6)} + ${fees1.toFixed(6)})`);
        return {
            feesEarnedUsd: totalFeesUsd,
            feesEarned: `${fees0.toFixed(6)} / ${fees1.toFixed(6)}`,
        };
    }
    catch (error) {
        console.error(`[Positions] calculateV4Fees failed for ${raw.id}:`, {
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
            position: {
                tokenId: raw.tokenId,
                token0: raw.token0Address,
                token1: raw.token1Address,
                fee: raw.fee,
                tickSpacing: raw.tickSpacing,
            }
        });
        return { feesEarnedUsd: 0, feesEarned: 'N/A' };
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
];
const V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const V4_STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71'; // Uniswap V4 StateView on Base
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
 * Fetch current sqrtPriceX96 and tick for a pool (using RawPosition)
 */
async function fetchPoolSqrtPriceForRaw(raw, alchemyKey) {
    const rpcUrl = alchemyKey
        ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : 'https://mainnet.base.org';
    const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
    });
    try {
        if (raw.version === 'V3' && raw.fee) {
            // For V3, find the pool using the fee tier we know from the position
            const poolAddress = await client.readContract({
                address: V3_FACTORY,
                abi: V3_FACTORY_ABI,
                functionName: 'getPool',
                args: [raw.token0Address, raw.token1Address, raw.fee],
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
            console.warn(`[Positions] V3 pool not found for ${raw.token0Address}/${raw.token1Address} fee=${raw.fee}`);
            return null;
        }
        else if (raw.version === 'V4' && raw.fee !== undefined && raw.tickSpacing !== undefined && raw.hooks) {
            // V4 - use StateView to get slot0 (requires poolId, not poolKey)
            const poolId = calculateV4PoolId(raw.token0Address, raw.token1Address, raw.fee, raw.tickSpacing, raw.hooks);
            const slot0 = await client.readContract({
                address: V4_STATE_VIEW,
                abi: V4_STATE_VIEW_ABI,
                functionName: 'getSlot0',
                args: [poolId],
            });
            return {
                sqrtPriceX96: slot0[0],
                tick: Number(slot0[1]),
            };
        }
        console.warn(`[Positions] Missing pool parameters for ${raw.version} position ${raw.id}`);
        return null;
    }
    catch (error) {
        console.error(`[Positions] Error fetching slot0 for ${raw.version} pool:`, error);
        return null;
    }
}
