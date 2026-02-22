/**
 * Build a transaction for transferring a Uniswap position NFT via ERC721 safeTransferFrom
 *
 * V3: NonfungiblePositionManager (ERC721)
 * V4: PositionManager (ERC721)
 */

import { encodeFunctionData, Address } from 'viem';

const V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ERC721 safeTransferFrom(address,address,uint256)
const ERC721_SAFE_TRANSFER_ABI = [
  {
    name: 'safeTransferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export interface TransferPositionParams {
  from: string;    // Current owner address
  to: string;      // Recipient address
  tokenId: bigint;
  version: 'V3' | 'V4';
}

export interface TransferPositionTransaction {
  to: Address;
  data: `0x${string}`;
  value: string;
}

export function buildTransferPositionTransaction(params: TransferPositionParams): TransferPositionTransaction {
  const { from, to, tokenId, version } = params;

  if (to.toLowerCase() === ZERO_ADDRESS) {
    throw new Error('Cannot transfer to the zero address');
  }

  const positionManager = version === 'V3' ? V3_POSITION_MANAGER : V4_POSITION_MANAGER;

  const data = encodeFunctionData({
    abi: ERC721_SAFE_TRANSFER_ABI,
    functionName: 'safeTransferFrom',
    args: [from as Address, to as Address, tokenId],
  });

  return {
    to: positionManager as Address,
    data,
    value: '0',
  };
}
