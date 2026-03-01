import { NextResponse } from 'next/server'
import { getCorePrices } from '@arbme/core-lib'

export const maxDuration = 30

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

export async function GET() {
  try {
    const prices = await getCorePrices(ALCHEMY_KEY)

    return NextResponse.json(prices, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error: any) {
    console.error('[pools/prices] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch prices' },
      { status: 500 }
    )
  }
}
