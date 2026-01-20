/**
 * Debug Transaction Revert
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
async function debugTransaction(txHash) {
    console.log(`\n🔍 Debugging transaction: ${txHash}\n`);
    // Get transaction receipt
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    console.log('Transaction Receipt:');
    console.log(`  Status: ${receipt.status}`);
    console.log(`  Gas Used: ${receipt.gasUsed}`);
    console.log(`  Logs: ${receipt.logs.length}`);
    // Get transaction details
    const tx = await publicClient.getTransaction({ hash: txHash });
    console.log('\nTransaction Details:');
    console.log(`  From: ${tx.from}`);
    console.log(`  To: ${tx.to}`);
    console.log(`  Value: ${tx.value}`);
    console.log(`  Gas: ${tx.gas}`);
    console.log(`  Gas Price: ${tx.gasPrice}`);
    console.log(`  Data length: ${tx.input.length}`);
    // Try to trace the transaction
    try {
        const trace = await publicClient.request({
            method: 'debug_traceTransaction',
            params: [txHash, { tracer: 'callTracer' }],
        });
        console.log('\nTrace:');
        console.log(JSON.stringify(trace, null, 2));
    }
    catch (error) {
        console.log('\nCould not trace transaction (debug_traceTransaction not available)');
    }
    // Try eth_call to simulate and get revert reason
    try {
        console.log('\nSimulating transaction...');
        const result = await publicClient.call({
            account: tx.from,
            to: tx.to,
            data: tx.input,
            value: tx.value,
            gas: tx.gas,
            gasPrice: tx.gasPrice,
        });
        console.log('Simulation result:', result);
    }
    catch (error) {
        console.log('\nSimulation error:');
        console.log(error.message);
        if (error.data) {
            console.log('Error data:', error.data);
        }
    }
    console.log('\n');
}
const txHash = '0x91a8f5f19d05f883878cfb84225e350029ba44f54ed436b4b54d534f7e3772f7';
debugTransaction(txHash).catch(console.error);
