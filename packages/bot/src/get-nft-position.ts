/**
 * Get V4 position details from NFT
 */

import dotenv from 'dotenv';
import { createPublicClient, http, decodeAbiParameters, parseAbiParameters } from 'viem';
import { base } from 'viem/chains';

dotenv.config({ path: '../.env' });

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY!;

const publicClient = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
});

// V4 Position Manager NFT
const positionManager = '0x7c5f5a4bbd8fd63184577525326123b519429bdc' as `0x${string}`;
const tokenId = 988887n;

const POSITION_MANAGER_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getPoolAndPositionInfo',
    outputs: [
      { name: 'poolKey', type: 'tuple', components: [
        { name: 'currency0', type: 'address' },
        { name: 'currency1', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'tickSpacing', type: 'int24' },
        { name: 'hooks', type: 'address' },
      ]},
      { name: 'info', type: 'tuple', components: [
        { name: 'hasSubscriber', type: 'uint8' },
        { name: 'tickUpper', type: 'int24' },
        { name: 'tickLower', type: 'int24' },
        { name: 'poolId', type: 'bytes25' },
      ]},
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function getPositionDetails() {
  console.log('\n🔍 Getting V4 Position Details\n');
  console.log(`Position Manager: ${positionManager}`);
  console.log(`Token ID: ${tokenId}\n`);

  try {
    const [poolKey, info] = await publicClient.readContract({
      address: positionManager,
      abi: POSITION_MANAGER_ABI,
      functionName: 'getPoolAndPositionInfo',
      args: [tokenId],
    });

    console.log('✅ Position Found!\n');
    console.log('Pool Key:');
    console.log(`  currency0: ${poolKey.currency0}`);
    console.log(`  currency1: ${poolKey.currency1}`);
    console.log(`  fee: ${poolKey.fee} (${Number(poolKey.fee) / 10000}%)`);
    console.log(`  tickSpacing: ${poolKey.tickSpacing}`);
    console.log(`  hooks: ${poolKey.hooks}`);
    console.log('\nPosition Info:');
    console.log(`  tickLower: ${info.tickLower}`);
    console.log(`  tickUpper: ${info.tickUpper}`);
    console.log(`  poolId: ${info.poolId}`);

    console.log('\n');
  } catch (error: any) {
    console.log('❌ Error getting position:');
    console.log(error.message);
    console.log('\n');
  }
}

getPositionDetails().catch(console.error);
