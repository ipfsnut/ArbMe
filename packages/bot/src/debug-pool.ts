/**
 * Debug pool configuration
 */

import dotenv from 'dotenv';
import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';

dotenv.config({ path: '../.env' });

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY!;

const publicClient = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
});

const STATE_VIEW_ABI = [
  {
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    name: 'getSlot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71' as Address;

// From API - this is the pool ID we know exists
const ARBME_WETH_POOL_ID = '0x6afd39b7114a0892d10ffaae2eefcc16777dd376273c25d9d4f3a1a065131b83' as Address;

async function debugPool() {
  console.log('🔍 Debugging ARBME/WETH Pool\n');
  console.log(`Pool ID: ${ARBME_WETH_POOL_ID}\n`);

  try {
    const [sqrtPriceX96, tick, protocolFee, lpFee] = await publicClient.readContract({
      address: STATE_VIEW,
      abi: STATE_VIEW_ABI,
      functionName: 'getSlot0',
      args: [ARBME_WETH_POOL_ID],
    });

    console.log('✅ Pool EXISTS and is active!\n');
    console.log('Pool State:');
    console.log(`  sqrtPriceX96: ${sqrtPriceX96}`);
    console.log(`  tick: ${tick}`);
    console.log(`  protocolFee: ${protocolFee}`);
    console.log(`  lpFee: ${lpFee}`);
    console.log(`  lpFee (bps): ${Number(lpFee)}`);
    console.log(`  lpFee (%): ${Number(lpFee) / 10000}%`);

    console.log('\n📌 Key Info:');
    console.log(`  This pool has ${Number(lpFee) / 10000}% fee`);
    console.log(`  We were trying to use 3% (30000 bps)`);
    console.log(`  ${Number(lpFee) === 30000 ? '✅ MATCH!' : '❌ MISMATCH!'}`);

  } catch (error) {
    console.log('❌ Pool does NOT exist or error querying:');
    console.log(error);
  }
}

debugPool();
