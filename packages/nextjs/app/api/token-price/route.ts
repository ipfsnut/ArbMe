import { NextResponse } from 'next/server'
import { getTokenPrice, getTokenPrices } from '@arbme/core-lib'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const addresses = searchParams.get('addresses')

  const alchemyKey = process.env.ALCHEMY_API_KEY

  // Single token price
  if (address) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Invalid address format' }, { status: 400 })
    }

    try {
      const price = await getTokenPrice(address, alchemyKey)
      return NextResponse.json({ address, price })
    } catch (error) {
      console.error('[token-price] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch price' }, { status: 500 })
    }
  }

  // Multiple token prices
  if (addresses) {
    const addressList = addresses.split(',').map(a => a.trim())

    for (const addr of addressList) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return NextResponse.json({ error: `Invalid address format: ${addr}` }, { status: 400 })
      }
    }

    try {
      const prices = await getTokenPrices(addressList, alchemyKey)
      const result: Record<string, number> = {}
      for (const [addr, price] of prices) {
        result[addr] = price
      }
      return NextResponse.json({ prices: result })
    } catch (error) {
      console.error('[token-price] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Missing address or addresses parameter' }, { status: 400 })
}
