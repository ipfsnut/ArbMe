/**
 * Get V4 position details using raw call
 */
import dotenv from 'dotenv';
import { createPublicClient, http, encodeFunctionData, parseAbiParameters, decodeAbiParameters } from 'viem';
import { base } from 'viem/chains';
dotenv.config({ path: '../.env' });
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const publicClient = createPublicClient({
    chain: base,
    transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
});
const positionManager = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';
const tokenId = 988887n;
async function getRawPosition() {
    console.log('\n🔍 Getting V4 Position (Raw Call)\n');
    // Call getPoolAndPositionInfo
    const data = encodeFunctionData({
        abi: [{
                inputs: [{ name: 'tokenId', type: 'uint256' }],
                name: 'getPoolAndPositionInfo',
                outputs: [
                    { name: 'poolKey', type: 'tuple', components: [
                            { name: 'currency0', type: 'address' },
                            { name: 'currency1', type: 'address' },
                            { name: 'fee', type: 'uint24' },
                            { name: 'tickSpacing', type: 'int24' },
                            { name: 'hooks', type: 'address' },
                        ] },
                    { name: 'info', type: 'bytes32' }, // Get as raw bytes32 instead of unpacking
                ],
                stateMutability: 'view',
                type: 'function',
            }],
        functionName: 'getPoolAndPositionInfo',
        args: [tokenId],
    });
    const result = await publicClient.call({
        to: positionManager,
        data,
    });
    if (!result.data) {
        console.log('No data returned');
        return;
    }
    // Decode manually
    const decoded = decodeAbiParameters(parseAbiParameters('(address,address,uint24,int24,address),bytes32'), result.data);
    const poolKey = decoded[0];
    const rawInfo = decoded[1];
    console.log('✅ Position Found!\n');
    console.log('Pool Key:');
    console.log(`  currency0: ${poolKey[0]}`);
    console.log(`  currency1: ${poolKey[1]}`);
    console.log(`  fee: ${poolKey[2]} (${Number(poolKey[2]) / 10000}%)`);
    console.log(`  tickSpacing: ${poolKey[3]}`);
    console.log(`  hooks: ${poolKey[4]}`);
    console.log('\nRaw Position Info:');
    console.log(`  ${rawInfo}`);
    console.log('\n');
}
getRawPosition().catch(console.error);
