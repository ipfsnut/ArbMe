import { NextRequest, NextResponse } from 'next/server'
import { fetchUserPositions } from '@arbme/core-lib'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const searchParams = request.nextUrl.searchParams
  const wallet = searchParams.get('wallet')

  if (!id) {
    return NextResponse.json(
      { error: 'Position ID required' },
      { status: 400 }
    )
  }

  if (!wallet) {
    return NextResponse.json(
      { error: 'Wallet address required' },
      { status: 400 }
    )
  }

  try {
    console.log(`[API] Fetching position ${id} for wallet: ${wallet}`)
    const alchemyKey = process.env.ALCHEMY_API_KEY
    const positions = await fetchUserPositions(wallet, alchemyKey)
    const position = positions.find(p => p.id === id)

    if (!position) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(position)
  } catch (error) {
    console.error('[API] Failed to fetch position:', error)
    return NextResponse.json(
      { error: 'Failed to fetch position' },
      { status: 500 }
    )
  }
}
