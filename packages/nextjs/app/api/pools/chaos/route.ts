import { NextResponse } from 'next/server'
import { fetchPoolsForToken } from '@arbme/core-lib'

export const maxDuration = 60

const CHAOSLP_ADDRESS = '0x8454d062506a27675706148ecdd194e45e44067a'

export async function GET() {
  try {
    const data = await fetchPoolsForToken(CHAOSLP_ADDRESS)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error: any) {
    console.error('[pools/chaos] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch CHAOSLP pools' },
      { status: 500 }
    )
  }
}
