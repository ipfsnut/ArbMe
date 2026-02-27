import { NextResponse } from 'next/server'
import { fetchPoolsForToken } from '@arbme/core-lib'

export const maxDuration = 60

const RATCHET_ADDRESS = '0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07'

export async function GET() {
  try {
    const data = await fetchPoolsForToken(RATCHET_ADDRESS)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error: any) {
    console.error('[pools/ratchet] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch RATCHET pools' },
      { status: 500 }
    )
  }
}
