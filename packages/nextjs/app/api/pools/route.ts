import { NextResponse } from 'next/server'
import { fetchPools } from '@arbme/core-lib'

export const maxDuration = 60

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

export async function GET() {
  try {
    const data = await fetchPools(ALCHEMY_KEY)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error: any) {
    console.error('[pools] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pools' },
      { status: 500 }
    )
  }
}
