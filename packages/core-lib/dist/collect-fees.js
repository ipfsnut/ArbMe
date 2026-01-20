/**
 * Build transactions for collecting fees from Uniswap positions
 */
import { encodeFunctionData } from 'viem';
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
];
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
];
/**
 * Build a transaction to collect fees from a position
 */
export function buildCollectFeesTransaction(params) {
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
            recipient: recipient,
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128,
        };
        const data = encodeFunctionData({
            abi: V3_COLLECT_ABI,
            functionName: 'collect',
            args: [collectParams],
        });
        return {
            to: V3_POSITION_MANAGER,
            data,
            value: '0',
        };
    }
    else if (version === 'v4') {
        // V4 collect params (includes hookData)
        const data = encodeFunctionData({
            abi: V4_COLLECT_ABI,
            functionName: 'collect',
            args: [
                tokenId,
                recipient,
                MAX_UINT128,
                MAX_UINT128,
                '0x',
            ],
        });
        return {
            to: V4_POSITION_MANAGER,
            data,
            value: '0',
        };
    }
    else {
        throw new Error(`Unsupported position version: ${version}`);
    }
}
/**
 * V2 positions don't have separate fee collection - fees are in the LP token value
 */
export function canCollectFees(positionVersion) {
    return positionVersion === 'V3' || positionVersion === 'V4';
}
