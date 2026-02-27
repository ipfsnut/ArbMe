import { NextResponse } from 'next/server'
import { fetchPoolsForToken } from '@arbme/core-lib'

export const maxDuration = 60

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY
const ARBME_ADDRESS = '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07'

export async function GET() {
  try {
    const data = await fetchPoolsForToken(ARBME_ADDRESS, ALCHEMY_KEY)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error: any) {
    console.error('[pools/arbme] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ARBME pools' },
      { status: 500 }
    )
  }
}
