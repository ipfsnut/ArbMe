/**
 * Test RPC Connection
 *
 * Verifies that your RPC setup works before deploying
 */
import { createPublicClient, http, formatUnits, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';
dotenv.config();
const rpcUrl = process.env.ALCHEMY_API_KEY
    ? `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    : process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl, { timeout: 10_000 }),
});
const PAIR_ABI = [
    parseAbiItem('function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'),
];
const TEST_POOL = {
    name: 'CLANKER/ARBME',
    address: '0x14aeb8cfdf477001a60f5196ec2ddfe94771b794',
};
async function testConnection() {
    console.log('🔧 Testing RPC Connection...\n');
    console.log(`RPC URL: ${rpcUrl.includes('alchemy') ? 'Alchemy (✅ recommended)' : rpcUrl}\n`);
    try {
        // Test 1: Get block number
        console.log('Test 1: Fetching latest block number...');
        const blockNumber = await client.getBlockNumber();
        console.log(`✅ Block number: ${blockNumber}\n`);
        // Test 2: Fetch pool reserves
        console.log(`Test 2: Fetching reserves from ${TEST_POOL.name} pool...`);
        const [reserve0, reserve1] = await client.readContract({
            address: TEST_POOL.address,
            abi: PAIR_ABI,
            functionName: 'getReserves',
        });
        console.log(`✅ Reserve0: ${formatUnits(reserve0, 18)} CLANKER`);
        console.log(`✅ Reserve1: ${formatUnits(reserve1, 18)} ARBME`);
        console.log(`✅ ARBME Price: ${(Number(formatUnits(reserve0, 18)) / Number(formatUnits(reserve1, 18))).toExponential(4)} CLANKER\n`);
        console.log('🎉 All tests passed! Your RPC setup is working.\n');
        console.log('Next steps:');
        console.log('1. npm start          - Run the bot locally');
        console.log('2. railway up         - Deploy to Railway');
    }
    catch (error) {
        console.error('❌ Test failed:', error instanceof Error ? error.message : error);
        console.log('\nTroubleshooting:');
        console.log('- Check your BASE_RPC_URL in .env');
        console.log('- If using Alchemy, verify ALCHEMY_API_KEY is correct');
        console.log('- Try a different RPC (e.g., https://mainnet.base.org)');
        process.exit(1);
    }
}
testConnection();
