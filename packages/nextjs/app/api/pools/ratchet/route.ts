import { NextResponse } from 'next/server'
import { fetchPoolsForToken } from '@arbme/core-lib'
import { RATCHET_ADDRESS } from '@/utils/constants'

export const maxDuration = 60

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
