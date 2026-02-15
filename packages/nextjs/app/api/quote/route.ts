import { NextRequest, NextResponse } from 'next/server'
import { getSwapQuote, CLANKER_HOOK_V2, CLANKER_HOOK_V1, CLANKER_DYNAMIC_FEE, CLANKER_TICK_SPACING } from '@arbme/core-lib'
import { createPublicClient, http, getAddress, keccak256, encodeAbiParameters, parseAbiParameters, zeroAddress, formatUnits } from 'viem'
import { base } from 'viem/chains'

export const maxDuration = 60

function getClient() {
  const key = process.env.ALCHEMY_API_KEY
  const rpcUrl = key
    ? `https://base-mainnet.g.alchemy.com/v2/${key}`
    : 'https://mainnet.base.org'
  return createPublicClient({ chain: base, transport: http(rpcUrl) })
}

// V4 StateView address (Base mainnet - verified 2026-02-01)
const STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71' as const

// V4 Quoter (Base mainnet — https://docs.uniswap.org/contracts/v4/deployments)
const V4_QUOTER = '0x0d5e0f971ed27fbff6c2837bf31316121532048d' as const

// V3 QuoterV2 (Base mainnet)
const V3_QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as const

const NO_HOOK = zeroAddress

// ABI fragments
const erc20Abi = [{ name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }] as const
const v2PairAbi = [
  { name: 'getReserves', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: 'reserve0', type: 'uint112' }, { name: 'reserve1', type: 'uint112' }, { name: 'blockTimestampLast', type: 'uint32' }] },
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const
const v3PoolAbi = [
  { name: 'slot0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: 'sqrtPriceX96', type: 'uint160' }, { name: 'tick', type: 'int24' }, { name: 'observationIndex', type: 'uint16' }, { name: 'observationCardinality', type: 'uint16' }, { name: 'observationCardinalityNext', type: 'uint16' }, { name: 'feeProtocol', type: 'uint8' }, { name: 'unlocked', type: 'bool' }] },
] as const
const stateViewAbi = [
  { name: 'getSlot0', type: 'function', stateMutability: 'view', inputs: [{ name: 'poolId', type: 'bytes32' }], outputs: [{ name: 'sqrtPriceX96', type: 'uint160' }, { name: 'tick', type: 'int24' }, { name: 'protocolFee', type: 'uint24' }, { name: 'lpFee', type: 'uint24' }] },
] as const

// V4 Quoter — quoteExactInputSingle uses revert-simulation (nonpayable but callable via eth_call)
const v4QuoterAbi = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{
      name: 'params',
      type: 'tuple',
      components: [
        {
          name: 'poolKey',
          type: 'tuple',
          components: [
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'hooks', type: 'address' },
          ],
        },
        { name: 'zeroForOne', type: 'bool' },
        { name: 'exactAmount', type: 'uint128' },
        { name: 'hookData', type: 'bytes' },
      ],
    }],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

// V3 QuoterV2 — also uses revert-simulation
const v3QuoterAbi = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{
      name: 'params',
      type: 'tuple',
      components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'fee', type: 'uint24' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ],
    }],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

// ═══════════════════════════════════════════════════════════════════════════════
// Price impact: compare execution price to spot price
// ═══════════════════════════════════════════════════════════════════════════════

function computePriceImpact(
  amountIn: bigint, amountOut: bigint,
  sqrtPriceX96: bigint,
  zeroForOne: boolean,
  decimalsIn: number, decimalsOut: number,
): number {
  if (amountIn === 0n || amountOut === 0n || sqrtPriceX96 === 0n) return 0

  // Execution price (output per input, decimal-adjusted)
  const execPrice = (Number(formatUnits(amountOut, decimalsOut))) /
                    (Number(formatUnits(amountIn, decimalsIn)))

  // Spot price from sqrtPriceX96: price = (sqrtPriceX96 / 2^96)^2
  // This gives price of token0 in terms of token1 (raw, no decimal adjust)
  const Q96 = 2n ** 96n
  const priceX192 = sqrtPriceX96 * sqrtPriceX96
  const rawSpotPrice = Number(priceX192) / Number(Q96 * Q96)

  // Decimal adjustment: spot price is token0/token1 in raw units
  // We need it in the same direction as execution price (tokenOut per tokenIn)
  let spotPrice: number
  if (zeroForOne) {
    // Selling token0 → getting token1. Spot price of token0 in token1 terms.
    spotPrice = rawSpotPrice * Math.pow(10, decimalsIn - decimalsOut)
  } else {
    // Selling token1 → getting token0. Invert.
    spotPrice = (1 / rawSpotPrice) * Math.pow(10, decimalsIn - decimalsOut)
  }

  if (spotPrice === 0 || !isFinite(spotPrice)) return 0

  const impact = Math.abs((execPrice - spotPrice) / spotPrice) * 100
  return Math.min(impact, 100)
}

// Pool config for auto-detection
interface PoolCandidate {
  fee: number
  tickSpacing: number
  hooks: string
  name: string
}

function getTickSpacing(fee: number): number {
  const spacings: Record<number, number> = {
    100: 1, 500: 10, 3000: 60, 10000: 200, 50000: 1000, 8388608: 200,
  }
  return spacings[fee] || 60
}

function getV4PoolCandidates(fee?: number, tickSpacing?: number, hooks?: string): PoolCandidate[] {
  const candidates: PoolCandidate[] = []

  // If caller provides explicit hooks, try that first
  if (hooks) {
    candidates.push({
      fee: fee || CLANKER_DYNAMIC_FEE,
      tickSpacing: tickSpacing || CLANKER_TICK_SPACING,
      hooks,
      name: 'explicit',
    })
  }

  // Clanker V2 hooked pool (most common for newer tokens)
  candidates.push({
    fee: CLANKER_DYNAMIC_FEE,
    tickSpacing: CLANKER_TICK_SPACING,
    hooks: CLANKER_HOOK_V2,
    name: 'clanker-v2',
  })

  // Clanker V1 hooked pool (older tokens)
  candidates.push({
    fee: CLANKER_DYNAMIC_FEE,
    tickSpacing: CLANKER_TICK_SPACING,
    hooks: CLANKER_HOOK_V1,
    name: 'clanker-v1',
  })

  // Standard hookless pools
  const standardFees = fee ? [fee] : [3000, 10000, 500, 50000]
  for (const f of standardFees) {
    candidates.push({
      fee: f,
      tickSpacing: tickSpacing || getTickSpacing(f),
      hooks: NO_HOOK,
      name: `v4-${f / 10000}%`,
    })
  }

  return candidates
}

export async function POST(request: NextRequest) {
  try {
    const { poolAddress, version, tokenIn, tokenOut, amountIn, fee, tickSpacing, hooks } = await request.json()

    if (!version || !tokenIn || !tokenOut || !amountIn) {
      return NextResponse.json(
        { error: 'Missing required parameters: version, tokenIn, tokenOut, amountIn' },
        { status: 400 }
      )
    }

    // poolAddress is required for V2/V3 but optional for V4 (auto-detected)
    if (!poolAddress && version.toUpperCase() !== 'V4') {
      return NextResponse.json(
        { error: 'poolAddress is required for V2 and V3 quotes' },
        { status: 400 }
      )
    }

    const client = getClient()

    // Get token decimals
    const [decimalsIn, decimalsOut] = await Promise.all([
      client.readContract({ address: getAddress(tokenIn), abi: erc20Abi, functionName: 'decimals' }),
      client.readContract({ address: getAddress(tokenOut), abi: erc20Abi, functionName: 'decimals' }),
    ])

    // Determine which token is token0 (lower address)
    const token0 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenIn : tokenOut
    const token1 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? tokenOut : tokenIn
    const decimals0 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? decimalsIn : decimalsOut
    const decimals1 = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? decimalsOut : decimalsIn

    let quoteParams: any = {
      poolAddress: poolAddress || '',
      version: version.toUpperCase(),
      tokenIn,
      tokenOut,
      amountIn,
      fee: fee || 3000,
      tickSpacing: tickSpacing || 60,
      decimals0,
      decimals1,
    }

    let detectedHooks: string | undefined

    if (version.toUpperCase() === 'V2') {
      // Fetch V2 reserves
      const [reserves, pairToken0] = await Promise.all([
        client.readContract({ address: getAddress(poolAddress), abi: v2PairAbi, functionName: 'getReserves' }),
        client.readContract({ address: getAddress(poolAddress), abi: v2PairAbi, functionName: 'token0' }),
      ])

      // Ensure reserves are in correct order
      const isToken0First = (pairToken0 as string).toLowerCase() === token0.toLowerCase()
      quoteParams.reserve0 = isToken0First ? reserves[0].toString() : reserves[1].toString()
      quoteParams.reserve1 = isToken0First ? reserves[1].toString() : reserves[0].toString()

    } else if (version.toUpperCase() === 'V3') {
      // Fetch V3 slot0 for spot price (used for price impact)
      const slot0 = await client.readContract({ address: getAddress(poolAddress), abi: v3PoolAbi, functionName: 'slot0' })
      const sqrtPriceX96 = slot0[0]
      quoteParams.sqrtPriceX96 = sqrtPriceX96.toString()

      // Use on-chain QuoterV2 for accurate amountOut
      try {
        const { result } = await client.simulateContract({
          address: V3_QUOTER,
          abi: v3QuoterAbi,
          functionName: 'quoteExactInputSingle',
          args: [{
            tokenIn: getAddress(tokenIn),
            tokenOut: getAddress(tokenOut),
            amountIn: BigInt(amountIn),
            fee: quoteParams.fee,
            sqrtPriceLimitX96: 0n,
          }],
        })

        const [amountOut, , , gasEstimate] = result
        const zeroForOne = tokenIn.toLowerCase() === token0.toLowerCase()
        const priceImpact = computePriceImpact(
          BigInt(amountIn), amountOut, sqrtPriceX96, zeroForOne, decimalsIn, decimalsOut,
        )

        const execPrice = Number(formatUnits(amountOut, decimalsOut)) /
                          Number(formatUnits(BigInt(amountIn), decimalsIn))

        return NextResponse.json({
          success: true,
          amountOut: amountOut.toString(),
          priceImpact,
          executionPrice: execPrice,
          gasEstimate: gasEstimate.toString(),
          quotedVia: 'quoter',
        })
      } catch (quoterErr: any) {
        console.warn('[quote] V3 QuoterV2 failed, falling back to spot price math:', quoterErr.message)
        // Fall through to core-lib spot price math
      }

    } else if (version.toUpperCase() === 'V4') {
      // ─── V4 Pool Detection ───
      // Detect pool config (hooks, fee, tickSpacing) and get sqrtPriceX96
      let detectedFee = fee
      let detectedTickSpacing = tickSpacing
      let sqrtPriceX96: bigint = 0n

      // If poolAddress is already a poolId (bytes32), use it directly
      if (poolAddress && poolAddress.length === 66) {
        try {
          const slot0 = await client.readContract({ address: STATE_VIEW, abi: stateViewAbi, functionName: 'getSlot0', args: [poolAddress as `0x${string}`] })
          sqrtPriceX96 = slot0[0]
          quoteParams.sqrtPriceX96 = sqrtPriceX96.toString()
          detectedHooks = hooks || NO_HOOK
          detectedFee = fee || 3000
          detectedTickSpacing = tickSpacing || 60
        } catch (e) {
          console.error('[quote] V4 direct poolId lookup failed:', e)
        }
      }

      // Auto-detect: try multiple pool configurations
      if (sqrtPriceX96 === 0n) {
        const candidates = getV4PoolCandidates(fee, tickSpacing, hooks)

        for (const candidate of candidates) {
          try {
            const poolId = keccak256(
              encodeAbiParameters(
                parseAbiParameters('address, address, uint24, int24, address'),
                [getAddress(token0), getAddress(token1), candidate.fee, candidate.tickSpacing, getAddress(candidate.hooks)]
              )
            )

            const slot0 = await client.readContract({ address: STATE_VIEW, abi: stateViewAbi, functionName: 'getSlot0', args: [poolId] })
            if (slot0[0] > 0n) {
              sqrtPriceX96 = slot0[0]
              quoteParams.sqrtPriceX96 = sqrtPriceX96.toString()
              quoteParams.fee = candidate.fee
              quoteParams.tickSpacing = candidate.tickSpacing
              detectedHooks = candidate.hooks
              detectedFee = candidate.fee
              detectedTickSpacing = candidate.tickSpacing
              console.log(`[quote] V4 pool found via ${candidate.name}: hooks=${candidate.hooks}`)
              break
            }
          } catch {
            // Pool doesn't exist with this config, try next
          }
        }

        if (sqrtPriceX96 === 0n) {
          return NextResponse.json(
            { error: 'No V4 pool found for this token pair. Tried Clanker V2, V1, and standard hookless pools.' },
            { status: 404 }
          )
        }
      }

      // ─── V4 Quoter: accurate on-chain quote ───
      const zeroForOne = tokenIn.toLowerCase() === token0.toLowerCase()
      const hookAddr = (detectedHooks || NO_HOOK) as `0x${string}`

      try {
        const { result } = await client.simulateContract({
          address: V4_QUOTER,
          abi: v4QuoterAbi,
          functionName: 'quoteExactInputSingle',
          args: [{
            poolKey: {
              currency0: getAddress(token0),
              currency1: getAddress(token1),
              fee: detectedFee || 3000,
              tickSpacing: detectedTickSpacing || 60,
              hooks: hookAddr,
            },
            zeroForOne,
            exactAmount: BigInt(amountIn),
            hookData: '0x' as `0x${string}`,
          }],
        })

        const [amountOut, gasEstimate] = result
        const priceImpact = computePriceImpact(
          BigInt(amountIn), amountOut, sqrtPriceX96, zeroForOne, decimalsIn, decimalsOut,
        )

        const execPrice = Number(formatUnits(amountOut, decimalsOut)) /
                          Number(formatUnits(BigInt(amountIn), decimalsIn))

        return NextResponse.json({
          success: true,
          amountOut: amountOut.toString(),
          priceImpact,
          executionPrice: execPrice,
          gasEstimate: gasEstimate.toString(),
          quotedVia: 'quoter',
          hooks: detectedHooks,
          fee: detectedFee,
          tickSpacing: detectedTickSpacing,
        })
      } catch (quoterErr: any) {
        console.warn('[quote] V4 Quoter failed, falling back to spot price math:', quoterErr.message)
        // Fall through to core-lib spot price math
      }
    }

    // ─── Fallback: core-lib spot price math ───
    const quote = getSwapQuote(quoteParams)

    return NextResponse.json({
      success: true,
      amountOut: quote.amountOut,
      priceImpact: quote.priceImpact,
      executionPrice: quote.executionPrice,
      quotedVia: 'spot-math',
      // For V4: return detected pool params so /api/swap can use them
      ...(detectedHooks !== undefined && {
        hooks: detectedHooks,
        fee: quoteParams.fee,
        tickSpacing: quoteParams.tickSpacing,
      }),
    })
  } catch (error: any) {
    console.error('[quote] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get swap quote' },
      { status: 500 }
    )
  }
}
