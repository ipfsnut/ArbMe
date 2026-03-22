/**
 * Swap Transaction Builders + Quote Functions
 *
 * V2: Uses Uniswap V2 Router swapExactTokensForTokens
 * V3: Uses SwapRouter02 exactInputSingle
 * V4: Uses Universal Router with V4_SWAP command
 */

import { encodeFunctionData, encodeAbiParameters, encodePacked, Address } from 'viem';
import { calculateV2AmountOut, Q96 } from './math.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CLANKER / HOOKED POOL CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const CLANKER_HOOK_V2: Address = '0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC';
export const CLANKER_HOOK_V1: Address = '0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC';
export const CLANKER_DYNAMIC_FEE = 8388608;  // 0x800000 — dynamic fee flag
export const CLANKER_TICK_SPACING = 200;

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════════

export const V2_SWAP_ROUTER: Address = '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24';
export const V3_SWAP_ROUTER: Address = '0x2626664c2603336E57B271c5C0b26F421741e481';
export const V4_UNIVERSAL_ROUTER: Address = '0x6ff5693b99212da76ad316178a184ab56d299b43';

// ═══════════════════════════════════════════════════════════════════════════════
// ABIs
// ═══════════════════════════════════════════════════════════════════════════════

const V2_SWAP_ABI = [
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

const V3_EXACT_INPUT_SINGLE_ABI = [
  {
    name: 'exactInputSingle',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const;

const V4_UNIVERSAL_ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SwapTransaction {
  to: Address;
  data: `0x${string}`;
  value: string;
}

export interface SwapQuote {
  amountOut: string;
  priceImpact: number;
  executionPrice: number;
}

export interface SwapParams {
  poolAddress: string;
  version: 'V2' | 'V3' | 'V4';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  recipient: string;
  fee?: number;
  tickSpacing?: number;
  slippageTolerance?: number;
  hooks?: string;  // V4 hook address (e.g. Clanker V2 hook). Defaults to address(0)
}

export interface QuoteParams {
  poolAddress: string;
  version: 'V2' | 'V3' | 'V4';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  fee?: number;
  tickSpacing?: number;
  // Pool state for quote calculation
  reserve0?: string;
  reserve1?: string;
  sqrtPriceX96?: string;
  decimals0?: number;
  decimals1?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get V2 swap quote using constant product formula
 */
export function getV2SwapQuote(params: QuoteParams): SwapQuote {
  const { tokenIn, tokenOut, amountIn, reserve0, reserve1, decimals0 = 18, decimals1 = 18 } = params;

  if (!reserve0 || !reserve1) {
    throw new Error('V2 quote requires reserve0 and reserve1');
  }

  const amountInBigInt = BigInt(amountIn);
  const reserveIn = BigInt(reserve0);
  const reserveOut = BigInt(reserve1);

  // Determine direction based on token addresses
  // Token0 is the lower address
  const token0 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenIn : tokenOut;
  const isToken0ToToken1 = tokenIn.toLowerCase() === token0.toLowerCase();

  const actualReserveIn = isToken0ToToken1 ? reserveIn : reserveOut;
  const actualReserveOut = isToken0ToToken1 ? reserveOut : reserveIn;

  const amountOutBigInt = calculateV2AmountOut(amountInBigInt, actualReserveIn, actualReserveOut);

  // Calculate price impact
  // Price impact = (executionPrice - spotPrice) / spotPrice
  const spotPrice = Number(actualReserveOut) / Number(actualReserveIn);
  const executionPrice = Number(amountOutBigInt) / Number(amountInBigInt);

  // Adjust for decimals
  const decimalAdjustment = Math.pow(10, (isToken0ToToken1 ? decimals0 : decimals1) - (isToken0ToToken1 ? decimals1 : decimals0));
  const adjustedSpotPrice = spotPrice * decimalAdjustment;
  const adjustedExecutionPrice = executionPrice * decimalAdjustment;

  const priceImpact = Math.abs((adjustedExecutionPrice - adjustedSpotPrice) / adjustedSpotPrice) * 100;

  return {
    amountOut: amountOutBigInt.toString(),
    priceImpact,
    executionPrice: adjustedExecutionPrice,
  };
}

/**
 * Get V3 swap quote using sqrtPriceX96
 */
export function getV3SwapQuote(params: QuoteParams): SwapQuote {
  const { tokenIn, tokenOut, amountIn, sqrtPriceX96, decimals0 = 18, decimals1 = 18, fee = 3000 } = params;

  if (!sqrtPriceX96) {
    throw new Error('V3 quote requires sqrtPriceX96');
  }

  const amountInBigInt = BigInt(amountIn);
  const sqrtPrice = BigInt(sqrtPriceX96);

  // Determine direction
  const token0 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenIn : tokenOut;
  const zeroForOne = tokenIn.toLowerCase() === token0.toLowerCase();

  // Calculate price from sqrtPriceX96
  // price = (sqrtPriceX96 / 2^96)^2
  const priceX192 = sqrtPrice * sqrtPrice;
  const Q192 = Q96 * Q96;

  // Calculate expected output
  // For zeroForOne: amountOut = amountIn * price
  // For oneForZero: amountOut = amountIn / price
  let amountOutBigInt: bigint;
  let executionPrice: number;
  let spotPrice: number;

  // Apply fee (fee is in hundredths of a bip, e.g., 3000 = 0.3%)
  const feeMultiplier = BigInt(1000000 - fee);
  const amountInAfterFee = (amountInBigInt * feeMultiplier) / BigInt(1000000);

  if (zeroForOne) {
    // Selling token0 for token1
    amountOutBigInt = (amountInAfterFee * priceX192) / Q192;
    const rawSpotPrice = Number(priceX192) / Number(Q192);
    spotPrice = rawSpotPrice * Math.pow(10, decimals0 - decimals1);
    executionPrice = (Number(amountOutBigInt) / Number(amountInBigInt)) * Math.pow(10, decimals0 - decimals1);
  } else {
    // Selling token1 for token0
    amountOutBigInt = (amountInAfterFee * Q192) / priceX192;
    const rawSpotPrice = Number(Q192) / Number(priceX192);
    spotPrice = rawSpotPrice * Math.pow(10, decimals1 - decimals0);
    executionPrice = (Number(amountOutBigInt) / Number(amountInBigInt)) * Math.pow(10, decimals1 - decimals0);
  }

  const priceImpact = Math.abs((executionPrice - spotPrice) / spotPrice) * 100;

  return {
    amountOut: amountOutBigInt.toString(),
    priceImpact,
    executionPrice,
  };
}

/**
 * Get V4 swap quote (similar to V3 with StateView data)
 */
export function getV4SwapQuote(params: QuoteParams): SwapQuote {
  // V4 uses similar pricing mechanism to V3
  return getV3SwapQuote(params);
}

/**
 * Unified quote function that routes to correct version
 */
export function getSwapQuote(params: QuoteParams): SwapQuote {
  switch (params.version) {
    case 'V2':
      return getV2SwapQuote(params);
    case 'V3':
      return getV3SwapQuote(params);
    case 'V4':
      return getV4SwapQuote(params);
    default:
      throw new Error(`Unsupported version: ${params.version}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWAP TRANSACTION BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build V2 swap transaction
 * Uses swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline)
 */
export function buildV2SwapTransaction(params: SwapParams): SwapTransaction {
  const { tokenIn, tokenOut, amountIn, minAmountOut, recipient } = params;

  // Deadline: 20 minutes from now
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const data = encodeFunctionData({
    abi: V2_SWAP_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [
      BigInt(amountIn),
      BigInt(minAmountOut),
      [tokenIn as Address, tokenOut as Address],
      recipient as Address,
      deadline,
    ],
  });

  return {
    to: V2_SWAP_ROUTER,
    data,
    value: '0',
  };
}

/**
 * Build V3 swap transaction
 * Uses exactInputSingle on SwapRouter02
 */
export function buildV3SwapTransaction(params: SwapParams): SwapTransaction {
  const { tokenIn, tokenOut, amountIn, minAmountOut, recipient, fee = 3000 } = params;

  const swapParams = {
    tokenIn: tokenIn as Address,
    tokenOut: tokenOut as Address,
    fee: fee,
    recipient: recipient as Address,
    amountIn: BigInt(amountIn),
    amountOutMinimum: BigInt(minAmountOut),
    sqrtPriceLimitX96: BigInt(0), // No price limit
  };

  const data = encodeFunctionData({
    abi: V3_EXACT_INPUT_SINGLE_ABI,
    functionName: 'exactInputSingle',
    args: [swapParams],
  });

  return {
    to: V3_SWAP_ROUTER,
    data,
    value: '0',
  };
}

/**
 * Build V4 swap transaction
 * Uses Universal Router execute(commands, inputs[], deadline)
 * Command 0x10 = V4_SWAP
 *
 * The V4_SWAP input is abi.encode(actions, params[]) where:
 *   actions = encodePacked(SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL)
 *   params  = [swapParams, settleParams, takeParams]
 *
 * Action bytes (from Uniswap v4-periphery Actions.sol):
 *   SWAP_EXACT_IN_SINGLE = 0x06
 *   SETTLE_ALL           = 0x0c
 *   TAKE_ALL             = 0x0f
 */
export function buildV4SwapTransaction(params: SwapParams): SwapTransaction {
  const { tokenIn, tokenOut, amountIn, minAmountOut, recipient, fee = 3000, tickSpacing = 60, hooks } = params;
  const hookAddress = (hooks || '0x0000000000000000000000000000000000000000') as Address;

  // Deadline: 20 minutes from now
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  // Sort tokens for PoolKey (currency0 < currency1)
  const currency0 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenIn : tokenOut;
  const currency1 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenOut : tokenIn;
  const zeroForOne = tokenIn.toLowerCase() === currency0.toLowerCase();

  // V4_SWAP command = 0x10
  const commands = '0x10' as `0x${string}`;

  // Actions: SWAP_EXACT_IN_SINGLE(0x06), SETTLE(0x0b), TAKE(0x0e)
  // Using SETTLE+TAKE (not SETTLE_ALL+TAKE_ALL) to match Uniswap SDK behavior
  const actions = encodePacked(
    ['uint8', 'uint8', 'uint8'],
    [0x06, 0x0b, 0x0e],
  );

  // Param 0: ExactInputSingleParams
  const swapParam = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          {
            type: 'tuple',
            name: 'poolKey',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [
      {
        poolKey: {
          currency0: currency0 as Address,
          currency1: currency1 as Address,
          fee: fee,
          tickSpacing: tickSpacing,
          hooks: hookAddress,
        },
        zeroForOne: zeroForOne,
        amountIn: BigInt(amountIn),
        amountOutMinimum: BigInt(minAmountOut),
        hookData: '0x' as `0x${string}`,
      },
    ],
  );

  // Param 1: SETTLE — pay the input currency from user via Permit2
  // amount=0 means "settle the full swap delta" (same as Uniswap SDK FULL_DELTA_AMOUNT)
  // payerIsUser=true means pull from user via Permit2.transferFrom
  const currencyIn = zeroForOne ? currency0 : currency1;
  const settleParam = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }],
    [currencyIn as Address, 0n, true],
  );

  // Param 2: TAKE — send output currency to recipient
  // amount=0 means "take the full swap delta"
  const currencyOut = zeroForOne ? currency1 : currency0;
  const takeParam = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }],
    [currencyOut as Address, recipient as Address, 0n],
  );

  // Wrap as abi.encode(bytes actions, bytes[] params) for V4_SWAP input
  const v4SwapInput = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [actions, [swapParam, settleParam, takeParam]],
  );

  const data = encodeFunctionData({
    abi: V4_UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, [v4SwapInput], deadline],
  });

  return {
    to: V4_UNIVERSAL_ROUTER,
    data,
    value: '0',
  };
}

/**
 * Unified swap transaction builder that routes to correct version
 */
export function buildSwapTransaction(params: SwapParams): SwapTransaction {
  switch (params.version) {
    case 'V2':
      return buildV2SwapTransaction(params);
    case 'V3':
      return buildV3SwapTransaction(params);
    case 'V4':
      return buildV4SwapTransaction(params);
    default:
      throw new Error(`Unsupported version: ${params.version}`);
  }
}
