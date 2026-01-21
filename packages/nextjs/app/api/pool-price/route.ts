import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

const PROVIDER_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org'

// Uniswap V3 Pool ABI (minimal)
const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]

// Uniswap V2 Pair ABI (minimal)
const V2_PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]

// Factory ABIs for getting pool address
const V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
]

const V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
]

const FACTORY_ADDRESSES = {
  v2: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24', // Base V2 Factory
  v3: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD', // Base V3 Factory
  v4: '0x7c5f5a4bbd8fd63184577525326123b519429bdc', // Base V4 Position Manager
}

const ERC20_ABI = ['function symbol() view returns (string)']

export async function POST(request: NextRequest) {
  try {
    const { version, token0, token1, fee } = await request.json()

    if (!version || !token0 || !token1) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL)

    // Get token symbols
    const token0Contract = new ethers.Contract(token0, ERC20_ABI, provider)
    const token1Contract = new ethers.Contract(token1, ERC20_ABI, provider)

    const [symbol0, symbol1] = await Promise.all([
      token0Contract.symbol(),
      token1Contract.symbol(),
    ])

    if (version === 'v2') {
      // V2 uses reserves
      const factoryAddress = FACTORY_ADDRESSES.v2
      const factory = new ethers.Contract(factoryAddress, V2_FACTORY_ABI, provider)
      const pairAddress = await factory.getPair(token0, token1)

      if (pairAddress === ethers.constants.AddressZero) {
        return NextResponse.json({
          exists: false,
          price: null,
          priceDisplay: null,
          token0Symbol: symbol0,
          token1Symbol: symbol1,
        })
      }

      // Get reserves
      const pair = new ethers.Contract(pairAddress, V2_PAIR_ABI, provider)
      const reserves = await pair.getReserves()

      // Calculate price (reserve1 / reserve0)
      const reserve0 = Number(ethers.utils.formatUnits(reserves.reserve0, 18))
      const reserve1 = Number(ethers.utils.formatUnits(reserves.reserve1, 18))
      const price = reserve1 / reserve0

      const priceDisplay = `1 ${symbol0} = ${price.toFixed(6)} ${symbol1}`

      return NextResponse.json({
        exists: true,
        price,
        priceDisplay,
        token0Symbol: symbol0,
        token1Symbol: symbol1,
      })
    }

    // V3 and V4 use sqrtPriceX96
    const factoryAddress = FACTORY_ADDRESSES[version as 'v3' | 'v4']
    if (!factoryAddress) {
      return NextResponse.json(
        { error: `Unsupported version: ${version}` },
        { status: 400 }
      )
    }

    const factory = new ethers.Contract(factoryAddress, V3_FACTORY_ABI, provider)
    const poolAddress = await factory.getPool(token0, token1, fee)

    if (poolAddress === ethers.constants.AddressZero) {
      return NextResponse.json({
        exists: false,
        price: null,
        priceDisplay: null,
        token0Symbol: symbol0,
        token1Symbol: symbol1,
      })
    }

    // Get pool state
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider)
    const slot0 = await pool.slot0()
    const sqrtPriceX96 = slot0.sqrtPriceX96

    // Calculate price from sqrtPriceX96
    // price = (sqrtPriceX96 / 2^96) ^ 2
    const Q96 = ethers.BigNumber.from(2).pow(96)
    const sqrtPrice = Number(sqrtPriceX96.toString()) / Number(Q96.toString())
    const price = sqrtPrice ** 2

    const priceDisplay = `1 ${symbol0} = ${price.toFixed(6)} ${symbol1}`

    return NextResponse.json({
      exists: true,
      sqrtPriceX96: sqrtPriceX96.toString(),
      price,
      priceDisplay,
      token0Symbol: symbol0,
      token1Symbol: symbol1,
    })
  } catch (error: any) {
    console.error('[pool-price] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pool price' },
      { status: 500 }
    )
  }
}
