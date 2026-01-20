/**
 * Analyze a successful V4 swap transaction
 */
import dotenv from 'dotenv';
import { createPublicClient, http, decodeAbiParameters, parseAbiParameters } from 'viem';
import { base } from 'viem/chains';
dotenv.config({ path: '../.env' });
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const publicClient = createPublicClient({
    chain: base,
    transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
});
async function analyzeSuccessfulSwap(txHash) {
    console.log(`\n🔍 Analyzing successful swap: ${txHash}\n`);
    const tx = await publicClient.getTransaction({ hash: txHash });
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    console.log('Transaction Details:');
    console.log(`  Status: ${receipt.status}`);
    console.log(`  From: ${tx.from}`);
    console.log(`  To: ${tx.to}`);
    console.log(`  Value: ${tx.value}`);
    console.log(`  Gas Used: ${receipt.gasUsed}`);
    // Decode function call
    const funcSelector = tx.input.slice(0, 10);
    console.log(`\nFunction Selector: ${funcSelector}`);
    if (funcSelector === '0x3593564c') {
        console.log('  Function: execute(bytes,bytes[],uint256)');
    }
    else if (funcSelector === '0x24856bc3') {
        console.log('  Function: execute(bytes,bytes[])');
    }
    else if (funcSelector === '0x1f0464d1') {
        console.log('  Function: execute(bytes,bytes[],address,uint256,uint256)');
    }
    else {
        console.log(`  Unknown function: ${funcSelector}`);
    }
    // Try to decode the execute parameters
    console.log('\nInput Data:');
    console.log(`  Length: ${tx.input.length} characters`);
    console.log(`  Full data: ${tx.input.slice(0, 200)}...`);
    // Try different ABI decodings
    try {
        const decoded = decodeAbiParameters(parseAbiParameters('bytes,bytes[]'), `0x${tx.input.slice(10)}`);
        console.log('\nDecoded Parameters (execute(bytes,bytes[])):');
        console.log(`  Commands: ${decoded[0]}`);
        console.log(`  Inputs length: ${decoded[1].length}`);
        if (decoded[1].length > 0) {
            console.log(`  First input: ${decoded[1][0].slice(0, 200)}...`);
            // Try to decode the V4_SWAP input
            if (decoded[0] === '0x10') {
                console.log('\n  Command is V4_SWAP (0x10)');
                try {
                    const v4Input = decodeAbiParameters(parseAbiParameters('bytes,bytes[]'), decoded[1][0]);
                    console.log('  V4 Actions:', v4Input[0]);
                    console.log('  V4 Params length:', v4Input[1].length);
                    if (v4Input[1].length > 0) {
                        console.log('  First param:', v4Input[1][0].slice(0, 200));
                    }
                }
                catch (e) {
                    console.log('  Could not decode V4 input');
                }
            }
        }
    }
    catch (error) {
        console.log('Could not decode with execute(bytes,bytes[])');
        // Try with deadline parameter
        try {
            const decoded = decodeAbiParameters(parseAbiParameters('bytes,bytes[],uint256'), `0x${tx.input.slice(10)}`);
            console.log('\nDecoded Parameters (execute(bytes,bytes[],uint256)):');
            console.log(`  Commands: ${decoded[0]}`);
            console.log(`  Inputs length: ${decoded[1].length}`);
            console.log(`  Deadline: ${decoded[2]}`);
        }
        catch (e) {
            console.log('Could not decode with any known ABI');
        }
    }
    console.log('\nLogs:');
    console.log(`  Total logs: ${receipt.logs.length}`);
    if (receipt.logs.length > 0) {
        receipt.logs.forEach((log, i) => {
            console.log(`  Log ${i}: ${log.address}`);
            console.log(`    Topics: ${log.topics.length}`);
            if (log.topics[0]) {
                console.log(`    Event signature: ${log.topics[0]}`);
            }
        });
    }
    console.log('\n');
}
// Analyze a recent successful swap
const successfulTx = '0xdafb513e49c78774a4a2316fc7f626a043b6bd8e37dda5ba41e1d2c26ea6cfc5';
analyzeSuccessfulSwap(successfulTx).catch(console.error);
