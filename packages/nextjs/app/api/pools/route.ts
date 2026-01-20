import { NextResponse } from 'next/server'
import { fetchPools } from '@arbme/core-lib'

export async function GET() {
  try {
    const alchemyKey = process.env.ALCHEMY_API_KEY
    const data = await fetchPools(alchemyKey)
    return NextResponse.json(data)
  } catch (error) {
    console.error('[API] Failed to fetch pools:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pools' },
      { status: 500 }
    )
  }
}
