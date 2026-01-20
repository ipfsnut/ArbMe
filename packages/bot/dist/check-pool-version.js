/**
 * Check what version of Uniswap pool this actually is
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
// CLANKER/ARBME pool address
const poolAddress = '0x10830495714f0463b22fddb2e329e372f3ff86a865f01237cd98e4fc8770311a';
async function checkPoolVersion() {
    console.log('\n🔍 Checking pool version\n');
    console.log(`Pool Address: ${poolAddress}\n`);
    // Try V3 interface
    try {
        const [token0, token1, fee] = await Promise.all([
            publicClient.readContract({
                address: poolAddress,
                abi: [{
                        inputs: [],
                        name: 'token0',
                        outputs: [{ name: '', type: 'address' }],
                        stateMutability: 'view',
                        type: 'function',
                    }],
                functionName: 'token0',
            }),
            publicClient.readContract({
                address: poolAddress,
                abi: [{
                        inputs: [],
                        name: 'token1',
                        outputs: [{ name: '', type: 'address' }],
                        stateMutability: 'view',
                        type: 'function',
                    }],
                functionName: 'token1',
            }),
            publicClient.readContract({
                address: poolAddress,
                abi: [{
                        inputs: [],
                        name: 'fee',
                        outputs: [{ name: '', type: 'uint24' }],
                        stateMutability: 'view',
                        type: 'function',
                    }],
                functionName: 'fee',
            }),
        ]);
        console.log('✅ This is a Uniswap V3 Pool!');
        console.log(`  Token0: ${token0}`);
        console.log(`  Token1: ${token1}`);
        console.log(`  Fee: ${fee} (${Number(fee) / 10000}%)`);
        console.log('\n❌ We cannot use V4 SDK for V3 pools!\n');
        console.log('We need to use V3 swap router instead.\n');
    }
    catch (error) {
        console.log('❌ Not a V3 pool');
        // Try V2 interface
        try {
            const [token0, token1] = await Promise.all([
                publicClient.readContract({
                    address: poolAddress,
                    abi: [{
                            inputs: [],
                            name: 'token0',
                            outputs: [{ name: '', type: 'address' }],
                            stateMutability: 'view',
                            type: 'function',
                        }],
                    functionName: 'token0',
                }),
                publicClient.readContract({
                    address: poolAddress,
                    abi: [{
                            inputs: [],
                            name: 'token1',
                            outputs: [{ name: '', type: 'address' }],
                            stateMutability: 'view',
                            type: 'function',
                        }],
                    functionName: 'token1',
                }),
            ]);
            console.log('✅ This is a Uniswap V2 Pool!');
            console.log(`  Token0: ${token0}`);
            console.log(`  Token1: ${token1}\n`);
        }
        catch {
            console.log('❌ Unknown pool type\n');
        }
    }
}
checkPoolVersion().catch(console.error);
