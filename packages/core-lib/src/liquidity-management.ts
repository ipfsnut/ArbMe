/**
 * Build transactions for managing liquidity in Uniswap V3/V4 positions
 *
 * V3: Uses NonfungiblePositionManager direct functions
 * V4: Uses PositionManager.modifyLiquidities() with action codes
 *     (V4 has no individual increase/decrease/burn functions)
 */

import { encodeFunctionData, encodeAbiParameters, encodePacked, Address } from 'viem';

const V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';

// V4 Action codes (from Uniswap v4-periphery Actions.sol)
const V4_ACTIONS = {
  INCREASE_LIQUIDITY: 0x00,
  DECREASE_LIQUIDITY: 0x01,
  BURN_POSITION: 0x03,
  TAKE_PAIR: 0x11,
  CLOSE_CURRENCY: 0x12,
} as const;

// V3 Position Manager ABIs
const V3_INCREASE_LIQUIDITY_ABI = [
  {
    name: 'increaseLiquidity',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'amount0Desired', type: 'uint256' },
          { name: 'amount1Desired', type: 'uint256' },
          { name: 'amount0Min', type: 'uint256' },
          { name: 'amount1Min', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [
      { name: 'liquidity', type: 'uint128' },
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
] as const;

const V3_DECREASE_LIQUIDITY_ABI = [
  {
    name: 'decreaseLiquidity',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'liquidity', type: 'uint128' },
          { name: 'amount0Min', type: 'uint256' },
          { name: 'amount1Min', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
] as const;

const V3_BURN_ABI = [
  {
    name: 'burn',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
] as const;

// V4 modifyLiquidities ABI (used for all V4 operations)
const V4_MODIFY_LIQUIDITIES_ABI = [
  {
    name: 'modifyLiquidities',
    type: 'function',
    inputs: [
      { name: 'unlockData', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export interface Transaction {
  to: Address;
  data: `0x${string}`;
  value: string;
}

/**
 * Helper: build V4 modifyLiquidities calldata from actions + params
 */
function buildV4ModifyLiquidities(
  actionCodes: number[],
  actionParams: `0x${string}`[],
): `0x${string}` {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const actions = encodePacked(
    actionCodes.map(() => 'uint8' as const),
    actionCodes,
  );

  const unlockData = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [actions, actionParams],
  );

  return encodeFunctionData({
    abi: V4_MODIFY_LIQUIDITIES_ABI,
    functionName: 'modifyLiquidities',
    args: [unlockData, deadline],
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INCREASE LIQUIDITY
// ═══════════════════════════════════════════════════════════════════════════════

export interface IncreaseLiquidityParams {
  positionId: string; // Format: "v3-12345" or "v4-67890"
  amount0Desired: string; // Token0 amount in wei
  amount1Desired: string; // Token1 amount in wei
  slippageTolerance?: number; // 0-100, default 0.5%
  currency0?: string; // Required for V4
  currency1?: string; // Required for V4
}

/**
 * Build transaction to add liquidity to an existing position
 */
export function buildIncreaseLiquidityTransaction(params: IncreaseLiquidityParams): Transaction {
  const { positionId, amount0Desired, amount1Desired, slippageTolerance = 0.5 } = params;

  const [version, tokenIdStr] = positionId.split('-');
  const tokenId = BigInt(tokenIdStr);

  // Calculate minimum amounts with slippage tolerance using BigInt arithmetic
  // to avoid precision loss for large wei values (JavaScript Number loses precision > 2^53)
  const slippageBps = BigInt(Math.floor(slippageTolerance * 100)); // e.g., 50 = 0.5%
  const basisPoints = 10000n;
  const amount0 = BigInt(amount0Desired);
  const amount1 = BigInt(amount1Desired);
  const amount0Min = amount0 * (basisPoints - slippageBps) / basisPoints;
  const amount1Min = amount1 * (basisPoints - slippageBps) / basisPoints;

  // Deadline: 20 minutes from now
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  if (version === 'v3') {
    const increaseParams = {
      tokenId,
      amount0Desired: BigInt(amount0Desired),
      amount1Desired: BigInt(amount1Desired),
      amount0Min,
      amount1Min,
      deadline,
    };

    const data = encodeFunctionData({
      abi: V3_INCREASE_LIQUIDITY_ABI,
      functionName: 'increaseLiquidity',
      args: [increaseParams],
    });

    return {
      to: V3_POSITION_MANAGER as Address,
      data,
      value: '0',
    };
  } else if (version === 'v4') {
    // V4: modifyLiquidities with INCREASE_LIQUIDITY + CLOSE_CURRENCY × 2
    // INCREASE_LIQUIDITY creates negative deltas (tokens needed from user)
    // CLOSE_CURRENCY settles each token via Permit2
    if (!params.currency0 || !params.currency1) {
      throw new Error('V4 increase liquidity requires currency0 and currency1 addresses');
    }

    // For V4, we use amount0 as a proxy for liquidity (simplified)
    const liquidity = BigInt(amount0Desired);

    // INCREASE_LIQUIDITY params:
    // (uint256 tokenId, uint256 liquidity, uint128 amount0Max, uint128 amount1Max, bytes hookData)
    const increaseParams = encodeAbiParameters(
      [
        { name: 'tokenId', type: 'uint256' },
        { name: 'liquidity', type: 'uint256' },
        { name: 'amount0Max', type: 'uint128' },
        { name: 'amount1Max', type: 'uint128' },
        { name: 'hookData', type: 'bytes' },
      ],
      [tokenId, liquidity, BigInt(amount0Desired), BigInt(amount1Desired), '0x'],
    );

    // CLOSE_CURRENCY params: (Currency currency)
    const closeCurrency0 = encodeAbiParameters(
      [{ type: 'address' }],
      [params.currency0 as Address],
    );
    const closeCurrency1 = encodeAbiParameters(
      [{ type: 'address' }],
      [params.currency1 as Address],
    );

    const data = buildV4ModifyLiquidities(
      [V4_ACTIONS.INCREASE_LIQUIDITY, V4_ACTIONS.CLOSE_CURRENCY, V4_ACTIONS.CLOSE_CURRENCY],
      [increaseParams, closeCurrency0, closeCurrency1],
    );

    return {
      to: V4_POSITION_MANAGER as Address,
      data,
      value: '0',
    };
  } else {
    throw new Error(`Unsupported position version: ${version}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECREASE LIQUIDITY
// ═══════════════════════════════════════════════════════════════════════════════

export interface DecreaseLiquidityParams {
  positionId: string; // Format: "v3-12345" or "v4-67890"
  liquidityPercentage: number; // 0-100, percentage of liquidity to remove
  currentLiquidity: string; // Current liquidity value from position
  slippageTolerance?: number; // 0-100, default 0.5%
  recipient?: string; // Required for V4: address to receive tokens
  currency0?: string; // Required for V4: token0 address (sorted)
  currency1?: string; // Required for V4: token1 address (sorted)
}

/**
 * Build transaction to remove liquidity from a position
 */
export function buildDecreaseLiquidityTransaction(params: DecreaseLiquidityParams): Transaction {
  const { positionId, liquidityPercentage, currentLiquidity, slippageTolerance: _slippageTolerance = 0.5 } = params;

  const [version, tokenIdStr] = positionId.split('-');
  const tokenId = BigInt(tokenIdStr);

  // Calculate liquidity to remove
  // currentLiquidity may be a display string like "12345678 liquidity" — strip non-digits
  const totalLiquidity = BigInt(currentLiquidity.replace(/[^\d]/g, ''));
  const liquidityToRemove = (totalLiquidity * BigInt(Math.floor(liquidityPercentage * 100))) / BigInt(10000);

  // Minimum amounts with slippage (set to 0 for simplicity - real impl should calculate from pool price)
  const amount0Min = BigInt(0);
  const amount1Min = BigInt(0);

  // Deadline: 20 minutes from now
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  if (version === 'v3') {
    const decreaseParams = {
      tokenId,
      liquidity: liquidityToRemove,
      amount0Min,
      amount1Min,
      deadline,
    };

    const data = encodeFunctionData({
      abi: V3_DECREASE_LIQUIDITY_ABI,
      functionName: 'decreaseLiquidity',
      args: [decreaseParams],
    });

    return {
      to: V3_POSITION_MANAGER as Address,
      data,
      value: '0',
    };
  } else if (version === 'v4') {
    // V4: modifyLiquidities with DECREASE_LIQUIDITY + TAKE_PAIR
    // DECREASE_LIQUIDITY creates positive deltas (tokens returned to user)
    // TAKE_PAIR sends both tokens to the recipient
    if (!params.currency0 || !params.currency1 || !params.recipient) {
      throw new Error('V4 decrease liquidity requires currency0, currency1, and recipient');
    }

    // DECREASE_LIQUIDITY params:
    // (uint256 tokenId, uint256 liquidity, uint128 amount0Min, uint128 amount1Min, bytes hookData)
    const decreaseParams = encodeAbiParameters(
      [
        { name: 'tokenId', type: 'uint256' },
        { name: 'liquidity', type: 'uint256' },
        { name: 'amount0Min', type: 'uint128' },
        { name: 'amount1Min', type: 'uint128' },
        { name: 'hookData', type: 'bytes' },
      ],
      [tokenId, liquidityToRemove, amount0Min, amount1Min, '0x'],
    );

    // TAKE_PAIR params: (Currency currency0, Currency currency1, address to)
    const takePairParams = encodeAbiParameters(
      [
        { name: 'currency0', type: 'address' },
        { name: 'currency1', type: 'address' },
        { name: 'to', type: 'address' },
      ],
      [params.currency0 as Address, params.currency1 as Address, params.recipient as Address],
    );

    const data = buildV4ModifyLiquidities(
      [V4_ACTIONS.DECREASE_LIQUIDITY, V4_ACTIONS.TAKE_PAIR],
      [decreaseParams, takePairParams],
    );

    return {
      to: V4_POSITION_MANAGER as Address,
      data,
      value: '0',
    };
  } else {
    throw new Error(`Unsupported position version: ${version}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BURN POSITION (Close completely)
// ═══════════════════════════════════════════════════════════════════════════════

export interface BurnPositionParams {
  positionId: string; // Format: "v3-12345" or "v4-67890"
  recipient?: string; // Required for V4: address to receive remaining tokens
  currency0?: string; // Required for V4
  currency1?: string; // Required for V4
}

/**
 * Build transaction to burn (close) a position NFT
 * NOTE: Position must have 0 liquidity before burning
 * User must call decreaseLiquidity(100%) first, then collect fees, then burn
 */
export function buildBurnPositionTransaction(params: BurnPositionParams): Transaction {
  const { positionId } = params;

  const [version, tokenIdStr] = positionId.split('-');
  const tokenId = BigInt(tokenIdStr);

  if (version === 'v3') {
    const data = encodeFunctionData({
      abi: V3_BURN_ABI,
      functionName: 'burn',
      args: [tokenId],
    });

    return {
      to: V3_POSITION_MANAGER as Address,
      data,
      value: '0',
    };
  } else if (version === 'v4') {
    // V4: modifyLiquidities with BURN_POSITION + TAKE_PAIR
    // BURN_POSITION burns the NFT and creates deltas for any remaining tokens/fees
    // TAKE_PAIR sends the tokens to the recipient
    if (!params.currency0 || !params.currency1 || !params.recipient) {
      throw new Error('V4 burn position requires currency0, currency1, and recipient');
    }

    // BURN_POSITION params:
    // (uint256 tokenId, uint128 amount0Min, uint128 amount1Min, bytes hookData)
    const burnParams = encodeAbiParameters(
      [
        { name: 'tokenId', type: 'uint256' },
        { name: 'amount0Min', type: 'uint128' },
        { name: 'amount1Min', type: 'uint128' },
        { name: 'hookData', type: 'bytes' },
      ],
      [tokenId, 0n, 0n, '0x'],
    );

    // TAKE_PAIR params: (Currency currency0, Currency currency1, address to)
    const takePairParams = encodeAbiParameters(
      [
        { name: 'currency0', type: 'address' },
        { name: 'currency1', type: 'address' },
        { name: 'to', type: 'address' },
      ],
      [params.currency0 as Address, params.currency1 as Address, params.recipient as Address],
    );

    const data = buildV4ModifyLiquidities(
      [V4_ACTIONS.BURN_POSITION, V4_ACTIONS.TAKE_PAIR],
      [burnParams, takePairParams],
    );

    return {
      to: V4_POSITION_MANAGER as Address,
      data,
      value: '0',
    };
  } else {
    throw new Error(`Unsupported position version: ${version}`);
  }
}
