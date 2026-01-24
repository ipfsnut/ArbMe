import { NextRequest, NextResponse } from 'next/server'
import { getTokenMetadata } from '@arbme/core-lib'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const address = searchParams.get('address')

    if (!address) {
      return NextResponse.json(
        { error: 'Missing token address' },
        { status: 400 }
      )
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: 'Invalid token address format' },
        { status: 400 }
      )
    }

    const metadata = await getTokenMetadata(address, ALCHEMY_KEY)

    return NextResponse.json({
      address: metadata.address,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
    })
  } catch (error: any) {
    console.error('[token-info] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch token info' },
      { status: 500 }
    )
  }
}
