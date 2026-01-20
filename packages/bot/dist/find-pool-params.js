/**
 * Try different pool parameters to find the actual pool
 */
import dotenv from 'dotenv';
import { createPublicClient, http, encodeAbiParameters, parseAbiParameters, keccak256 } from 'viem';
import { base } from 'viem/chains';
dotenv.config({ path: '../.env' });
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const publicClient = createPublicClient({
    chain: base,
    transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
});
const POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b';
// Try both lowercase and uppercase (addresses should be case-insensitive but let's try)
const TOKENS = [
    {
        ARBME: '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07', // lowercase from API
        WETH: '0x4200000000000000000000000000000000000006',
    },
    {
        ARBME: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07', // uppercase/checksummed
        WETH: '0x4200000000000000000000000000000000000006',
    },
];
// Common Uniswap fee tiers
const FEE_TIERS = [
    { fee: 100, tickSpacing: 1, name: '0.01%' },
    { fee: 500, tickSpacing: 10, name: '0.05%' },
    { fee: 2500, tickSpacing: 50, name: '0.25%' },
    { fee: 3000, tickSpacing: 60, name: '0.3%' },
    { fee: 10000, tickSpacing: 200, name: '1%' },
    { fee: 30000, tickSpacing: 200, name: '3%' }, // What we've been using
];
const HOOKS = [
    '0x0000000000000000000000000000000000000000', // No hooks
];
async function findPool() {
    console.log('\n🔍 Searching for ARBME/WETH pool with different parameters...\n');
    for (const tokens of TOKENS) {
        console.log(`\nTrying with ARBME address: ${tokens.ARBME}`);
        for (const { fee, tickSpacing, name } of FEE_TIERS) {
            for (const hooks of HOOKS) {
                // Try both currency orders
                for (const [currency0, currency1] of [
                    [tokens.ARBME, tokens.WETH],
                    [tokens.WETH, tokens.ARBME],
                ]) {
                    const poolId = keccak256(encodeAbiParameters(parseAbiParameters('address,address,uint24,int24,address'), [currency0, currency1, fee, tickSpacing, hooks]));
                    try {
                        const liquidity = await publicClient.readContract({
                            address: POOL_MANAGER,
                            abi: [
                                {
                                    inputs: [{ name: 'id', type: 'bytes32' }],
                                    name: 'getLiquidity',
                                    outputs: [{ name: '', type: 'uint128' }],
                                    stateMutability: 'view',
                                    type: 'function',
                                },
                            ],
                            functionName: 'getLiquidity',
                            args: [poolId],
                        });
                        console.log(`\n✅ FOUND POOL!`);
                        console.log(`  Pool ID: ${poolId}`);
                        console.log(`  Currency0: ${currency0}`);
                        console.log(`  Currency1: ${currency1}`);
                        console.log(`  Fee: ${name} (${fee})`);
                        console.log(`  Tick Spacing: ${tickSpacing}`);
                        console.log(`  Hooks: ${hooks}`);
                        console.log(`  Liquidity: ${liquidity}`);
                        if (liquidity > 0n) {
                            console.log(`  ✅ Pool has liquidity!`);
                        }
                        else {
                            console.log(`  ⚠️  Pool exists but has ZERO liquidity`);
                        }
                    }
                    catch {
                        // Pool doesn't exist with these parameters
                    }
                }
            }
        }
    }
    console.log('\n✅ Search complete\n');
}
findPool().catch(console.error);
