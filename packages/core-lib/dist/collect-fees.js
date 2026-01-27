/**
 * Build transactions for collecting fees from Uniswap positions
 *
 * V3: Uses NonfungiblePositionManager.collect()
 * V4: Uses PositionManager.modifyLiquidities() with DECREASE_LIQUIDITY(0) + TAKE_PAIR
 *     (V4 has no collect() function — fees are collected by decreasing with 0 liquidity)
 */
import { encodeFunctionData, encodeAbiParameters, encodePacked } from 'viem';
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
// V4 Action codes (from Uniswap v4-periphery Actions.sol)
const V4_ACTIONS = {
    DECREASE_LIQUIDITY: 0x01,
    TAKE_PAIR: 0x11,
};
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
        // V3: Simple collect() call on NonfungiblePositionManager
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
        // V4: modifyLiquidities with DECREASE_LIQUIDITY(0) + TAKE_PAIR
        // DECREASE_LIQUIDITY with 0 liquidity triggers fee accrual without removing liquidity.
        // TAKE_PAIR sends the accrued fee deltas to the recipient.
        if (!params.currency0 || !params.currency1) {
            throw new Error('V4 collect fees requires currency0 and currency1 addresses');
        }
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
        // Encode DECREASE_LIQUIDITY params:
        // (uint256 tokenId, uint256 liquidity, uint128 amount0Min, uint128 amount1Min, bytes hookData)
        const decreaseParams = encodeAbiParameters([
            { name: 'tokenId', type: 'uint256' },
            { name: 'liquidity', type: 'uint256' },
            { name: 'amount0Min', type: 'uint128' },
            { name: 'amount1Min', type: 'uint128' },
            { name: 'hookData', type: 'bytes' },
        ], [tokenId, 0n, 0n, 0n, '0x']);
        // Encode TAKE_PAIR params:
        // (Currency currency0, Currency currency1, address to)
        const takePairParams = encodeAbiParameters([
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'to', type: 'address' },
        ], [params.currency0, params.currency1, recipient]);
        // Actions: [DECREASE_LIQUIDITY, TAKE_PAIR]
        const actions = encodePacked(['uint8', 'uint8'], [V4_ACTIONS.DECREASE_LIQUIDITY, V4_ACTIONS.TAKE_PAIR]);
        // Encode unlockData: abi.encode(bytes actions, bytes[] params)
        const unlockData = encodeAbiParameters([
            { type: 'bytes' },
            { type: 'bytes[]' },
        ], [actions, [decreaseParams, takePairParams]]);
        // Encode modifyLiquidities(bytes unlockData, uint256 deadline)
        const data = encodeFunctionData({
            abi: [{
                    name: 'modifyLiquidities',
                    type: 'function',
                    inputs: [
                        { name: 'unlockData', type: 'bytes' },
                        { name: 'deadline', type: 'uint256' },
                    ],
                    outputs: [],
                }],
            functionName: 'modifyLiquidities',
            args: [unlockData, deadline],
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
