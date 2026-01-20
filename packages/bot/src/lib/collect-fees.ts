/**
 * Build transactions for collecting fees from Uniswap positions
 */

import { encodeFunctionData, Address } from 'viem';

const V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';

// V3 Position Manager ABI (collect function)
const V3_COLLECT_ABI = [
  {
    name: 'collect',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'amount0Max', type: 'uint128' },
          { name: 'amount1Max', type: 'uint128' },
        ],
      },
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
] as const;

// V4 Position Manager ABI (collect function)
const V4_COLLECT_ABI = [
  {
    name: 'collect',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'amount0Max', type: 'uint128' },
      { name: 'amount1Max', type: 'uint128' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
] as const;

export interface CollectFeesParams {
  positionId: string; // Format: "v3-12345" or "v4-67890"
  recipient: string;  // Wallet address to receive fees
}

export interface CollectFeesTransaction {
  to: Address;
  data: `0x${string}`;
  value: string;
}

/**
 * Build a transaction to collect fees from a position
 */
export function buildCollectFeesTransaction(params: CollectFeesParams): CollectFeesTransaction {
  const { positionId, recipient } = params;

  // Parse position ID
  const [version, tokenIdStr] = positionId.split('-');
  const tokenId = BigInt(tokenIdStr);

  // Max uint128 to collect all available fees
  const MAX_UINT128 = BigInt('0xffffffffffffffffffffffffffffffff');

  if (version === 'v3') {
    // V3 collect params
    const collectParams = {
      tokenId,
      recipient: recipient as Address,
      amount0Max: MAX_UINT128,
      amount1Max: MAX_UINT128,
    };

    const data = encodeFunctionData({
      abi: V3_COLLECT_ABI,
      functionName: 'collect',
      args: [collectParams],
    });

    return {
      to: V3_POSITION_MANAGER as Address,
      data,
      value: '0',
    };
  } else if (version === 'v4') {
    // V4 collect params (includes hookData)
    const data = encodeFunctionData({
      abi: V4_COLLECT_ABI,
      functionName: 'collect',
      args: [
        tokenId,
        recipient as Address,
        MAX_UINT128,
        MAX_UINT128,
        '0x' as `0x${string}`, // Empty hookData
      ],
    });

    return {
      to: V4_POSITION_MANAGER as Address,
      data,
      value: '0',
    };
  } else {
    throw new Error(`Unsupported position version: ${version}`);
  }
}

/**
 * V2 positions don't have separate fee collection - fees are in the LP token value
 */
export function canCollectFees(positionVersion: string): boolean {
  return positionVersion === 'V3' || positionVersion === 'V4';
}
