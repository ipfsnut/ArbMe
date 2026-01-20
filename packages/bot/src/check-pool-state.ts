/**
 * Check V4 Pool State
 */

import dotenv from 'dotenv';
import { createPublicClient, http, encodeAbiParameters, parseAbiParameters, keccak256 } from 'viem';
import { base } from 'viem/chains';

dotenv.config({ path: '../.env' });

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY!;

const publicClient = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
});

const POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b';

const TOKENS = {
  ARBME: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07',
  WETH: '0x4200000000000000000000000000000000000006',
} as const;

async function checkPoolState() {
  console.log('\n🔍 Checking ARBME/WETH Pool State\n');

  const poolKey = {
    currency0: TOKENS.ARBME,
    currency1: TOKENS.WETH,
    fee: 30000,
    tickSpacing: 200,
    hooks: '0x0000000000000000000000000000000000000000',
  };

  console.log('Pool Key:');
  console.log(`  currency0: ${poolKey.currency0}`);
  console.log(`  currency1: ${poolKey.currency1}`);
  console.log(`  fee: ${poolKey.fee}`);
  console.log(`  tickSpacing: ${poolKey.tickSpacing}`);
  console.log(`  hooks: ${poolKey.hooks}`);

  // Calculate pool ID (hash of pool key)
  const poolId = keccak256(
    encodeAbiParameters(
      parseAbiParameters('address,address,uint24,int24,address'),
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
    )
  );

  console.log(`\nCalculated Pool ID: ${poolId}`);

  // Try to read pool state
  try {
    // Call getLiquidity(PoolId) to check if pool exists
    const result = await publicClient.readContract({
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

    console.log(`\n✅ Pool exists!`);
    console.log(`  Total Liquidity: ${result}`);

    if (result === 0n) {
      console.log('  ⚠️  WARNING: Pool has ZERO liquidity!');
    }
  } catch (error: any) {
    console.log(`\n❌ Error reading pool state:`);
    console.log(error.message);
  }

  // Try with reversed currency order
  const reversedPoolKey = {
    currency0: TOKENS.WETH,
    currency1: TOKENS.ARBME,
    fee: 30000,
    tickSpacing: 200,
    hooks: '0x0000000000000000000000000000000000000000',
  };

  const reversedPoolId = keccak256(
    encodeAbiParameters(
      parseAbiParameters('address,address,uint24,int24,address'),
      [reversedPoolKey.currency0, reversedPoolKey.currency1, reversedPoolKey.fee, reversedPoolKey.tickSpacing, reversedPoolKey.hooks]
    )
  );

  console.log(`\n🔄 Trying reversed currency order...`);
  console.log(`Reversed Pool ID: ${reversedPoolId}`);

  try {
    const result = await publicClient.readContract({
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
      args: [reversedPoolId],
    });

    console.log(`\n✅ Reversed pool exists!`);
    console.log(`  Total Liquidity: ${result}`);

    if (result === 0n) {
      console.log('  ⚠️  WARNING: Pool has ZERO liquidity!');
    }
  } catch (error: any) {
    console.log(`\n❌ Reversed pool doesn't exist or error:`);
    console.log(error.message);
  }

  // Check the pool ID from the API
  const apiPoolId = '0x6afd39b7114a0892d10ffaae2eefcc16777dd376273c25d9d4f3a1a065131b83';

  console.log(`\n📡 Trying pool ID from API...`);
  console.log(`API Pool ID: ${apiPoolId}`);

  try {
    const result = await publicClient.readContract({
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
      args: [apiPoolId as `0x${string}`],
    });

    console.log(`\n✅ API pool exists!`);
    console.log(`  Total Liquidity: ${result}`);

    if (result === 0n) {
      console.log('  ⚠️  WARNING: Pool has ZERO liquidity!');
    }
  } catch (error: any) {
    console.log(`\n❌ API pool doesn't exist or error:`);
    console.log(error.message);
  }

  console.log('\n');
}

checkPoolState().catch(console.error);
