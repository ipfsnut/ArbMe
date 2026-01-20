/**
 * Identify unknown contracts by querying on-chain
 */

import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://base.llamarpc.com'),
});

const ERC20_ABI = [
  parseAbiItem('function name() view returns (string)'),
  parseAbiItem('function symbol() view returns (string)'),
  parseAbiItem('function decimals() view returns (uint8)'),
];

const PAIR_ABI = [
  parseAbiItem('function token0() view returns (address)'),
  parseAbiItem('function token1() view returns (address)'),
  parseAbiItem('function getReserves() view returns (uint112, uint112, uint32)'),
];

const addresses = [
  { label: '#1 (ARBME)', address: '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07' },
  { label: '#2 (CLANKER)', address: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb' },
  { label: '#5 (Unknown)', address: '0xc1a6fbedae68e1472dbb91fe29b51f7a0bd44f97' },
];

const poolIds = [
  { label: '#4', id: '0x10830495714f0463b22fddb2e329e372f3ff86a865f01237cd98e4fc8770311a' },
  { label: '#6', id: '0x6afd39b7114a0892d10ffaae2eefcc16777dd376273c25d9d4f3a1a065131b83' },
];

async function identifyContract(address: string) {
  try {
    // Try ERC20 methods
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'name',
      }).catch(() => null),
      client.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }).catch(() => null),
      client.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }).catch(() => null),
    ]);

    if (name && symbol) {
      return { type: 'ERC20 Token', name, symbol, decimals };
    }

    // Try Uniswap V2 Pair methods
    const [token0, token1] = await Promise.all([
      client.readContract({
        address: address as `0x${string}`,
        abi: PAIR_ABI,
        functionName: 'token0',
      }).catch(() => null),
      client.readContract({
        address: address as `0x${string}`,
        abi: PAIR_ABI,
        functionName: 'token1',
      }).catch(() => null),
    ]);

    if (token0 && token1) {
      // Get token symbols
      const [token0Symbol, token1Symbol] = await Promise.all([
        client.readContract({
          address: token0 as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }).catch(() => 'Unknown'),
        client.readContract({
          address: token1 as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }).catch(() => 'Unknown'),
      ]);

      return {
        type: 'Uniswap V2 Pool',
        token0,
        token1,
        pairName: `${token0Symbol}/${token1Symbol}`,
      };
    }

    return { type: 'Unknown', error: 'Could not identify contract type' };
  } catch (error) {
    return { type: 'Error', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function main() {
  console.log('🔍 Identifying contracts on Base...\n');

  for (const { label, address } of addresses) {
    console.log(`${label}: ${address}`);
    const info = await identifyContract(address);
    console.log('   ', JSON.stringify(info, null, 2));
    console.log('');
  }

  console.log('\nPool IDs (these are V4 pool identifiers, not addresses):');
  for (const { label, id } of poolIds) {
    console.log(`${label}: ${id}`);
    console.log('    Type: Uniswap V4 Pool ID (hash of pool parameters)');
    console.log('');
  }
}

main();
