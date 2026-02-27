import { NextResponse } from 'next/server'
import { fetchPoolsForToken } from '@arbme/core-lib'

export const maxDuration = 60

const CHAOS_ADDRESS = '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292'

export async function GET() {
  try {
    const data = await fetchPoolsForToken(CHAOS_ADDRESS)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error: any) {
    console.error('[pools/chaos] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch CHAOS pools' },
      { status: 500 }
    )
  }
}
