/**
 * Check the real CLANKER/ARBME pool
 */
import dotenv from 'dotenv';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
dotenv.config({ path: '../.env' });
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const publicClient = createPublicClient({
    chain: base,
    transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
});
const POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b';
// From API - CLANKER/ARBME pool
const poolId = '0x10830495714f0463b22fddb2e329e372f3ff86a865f01237cd98e4fc8770311a';
// Pool info from API
const CLANKER = '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb';
const ARBME = '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07';
async function checkRealPool() {
    console.log('\n🔍 Checking CLANKER/ARBME Pool\n');
    console.log(`Pool ID: ${poolId}`);
    console.log(`CLANKER (token0): ${CLANKER}`);
    console.log(`ARBME (token1): ${ARBME}`);
    console.log(`Fee: 30000 (3%)\n`);
    try {
        const liquidity = await publicClient.readContract({
            address: POOL_MANAGER,
            abi: [{
                    inputs: [{ name: 'id', type: 'bytes32' }],
                    name: 'getLiquidity',
                    outputs: [{ name: '', type: 'uint128' }],
                    stateMutability: 'view',
                    type: 'function',
                }],
            functionName: 'getLiquidity',
            args: [poolId],
        });
        console.log(`✅ Pool exists!`);
        console.log(`Liquidity: ${liquidity.toString()}\n`);
    }
    catch (error) {
        console.log(`❌ Error:`);
        console.log(error.message);
        console.log('\nThis pool ID might not be a valid V4 pool ID\n');
    }
}
checkRealPool().catch(console.error);
