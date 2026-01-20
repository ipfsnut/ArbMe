import { NextRequest, NextResponse } from 'next/server'
import { fetchUserPositions } from '@arbme/core-lib'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const wallet = searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json(
      { error: 'Missing wallet parameter' },
      { status: 400 }
    )
  }

  try {
    console.log(`[API] Fetching positions for wallet: ${wallet}`)
    const alchemyKey = process.env.ALCHEMY_API_KEY
    const positions = await fetchUserPositions(wallet, alchemyKey)

    console.log(`[API] Found ${positions.length} positions`)
    return NextResponse.json(positions)
  } catch (error) {
    console.error('[API] Failed to fetch positions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    )
  }
}
