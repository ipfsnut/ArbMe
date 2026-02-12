import { NextRequest, NextResponse } from 'next/server'
import { getSwapQuote, CLANKER_HOOK_V2, CLANKER_HOOK_V1, CLANKER_DYNAMIC_FEE, CLANKER_TICK_SPACING } from '@arbme/core-lib'
import { createPublicClient, http, getAddress, keccak256, encodeAbiParameters, parseAbiParameters, zeroAddress } from 'viem'
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
      // Fetch V3 slot0
      const slot0 = await client.readContract({ address: getAddress(poolAddress), abi: v3PoolAbi, functionName: 'slot0' })
      quoteParams.sqrtPriceX96 = slot0[0].toString()

    } else if (version.toUpperCase() === 'V4') {
      // If poolAddress is already a poolId (bytes32), use it directly with provided params
      if (poolAddress && poolAddress.length === 66) {
        try {
          const slot0 = await client.readContract({ address: STATE_VIEW, abi: stateViewAbi, functionName: 'getSlot0', args: [poolAddress as `0x${string}`] })
          quoteParams.sqrtPriceX96 = slot0[0].toString()
          detectedHooks = hooks || NO_HOOK
        } catch (e) {
          console.error('[quote] V4 direct poolId lookup failed:', e)
        }
      }

      // Auto-detect: try multiple pool configurations
      if (!quoteParams.sqrtPriceX96) {
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
            // Check if pool actually exists (sqrtPriceX96 > 0)
            if (slot0[0] > 0n) {
              quoteParams.sqrtPriceX96 = slot0[0].toString()
              quoteParams.fee = candidate.fee
              quoteParams.tickSpacing = candidate.tickSpacing
              detectedHooks = candidate.hooks
              console.log(`[quote] V4 pool found via ${candidate.name}: hooks=${candidate.hooks}`)
              break
            }
          } catch {
            // Pool doesn't exist with this config, try next
          }
        }

        if (!quoteParams.sqrtPriceX96) {
          return NextResponse.json(
            { error: 'No V4 pool found for this token pair. Tried Clanker V2, V1, and standard hookless pools.' },
            { status: 404 }
          )
        }
      }
    }

    const quote = getSwapQuote(quoteParams)

    return NextResponse.json({
      success: true,
      amountOut: quote.amountOut,
      priceImpact: quote.priceImpact,
      executionPrice: quote.executionPrice,
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
