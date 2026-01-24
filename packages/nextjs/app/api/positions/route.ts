import { NextRequest, NextResponse } from 'next/server'
import { fetchUserPositions } from '@arbme/core-lib'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const wallet = searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json(
        { error: 'Missing wallet address' },
        { status: 400 }
      )
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    const positions = await fetchUserPositions(wallet, ALCHEMY_KEY)

    return NextResponse.json({
      wallet,
      positions,
      count: positions.length,
    })
  } catch (error: any) {
    console.error('[positions] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status: 500 }
    )
  }
}
