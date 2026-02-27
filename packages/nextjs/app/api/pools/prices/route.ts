import { NextResponse } from 'next/server'
import { fetchPoolsForToken } from '@arbme/core-lib'

export const maxDuration = 30

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY
const ARBME_ADDRESS = '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07'
const CHAOS_ADDRESS = '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292'
const RATCHET_ADDRESS = '0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07'

export async function GET() {
  try {
    // Fetch all three in parallel — each has its own cache so repeat calls are free
    const [arbme, chaos, ratchet] = await Promise.all([
      fetchPoolsForToken(ARBME_ADDRESS, ALCHEMY_KEY),
      fetchPoolsForToken(CHAOS_ADDRESS),
      fetchPoolsForToken(RATCHET_ADDRESS),
    ])

    return NextResponse.json({
      arbmePrice: arbme.tokenPrice,
      chaosPrice: chaos.tokenPrice,
      ratchetPrice: ratchet.tokenPrice,
      arbmeTvl: arbme.tvl,
      chaosTvl: chaos.tvl,
      ratchetTvl: ratchet.tvl,
      totalTvl: arbme.tvl + chaos.tvl + ratchet.tvl,
      lastUpdated: new Date().toISOString(),
    }, {
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
