import { NextRequest, NextResponse } from 'next/server'
import { getTokenMetadata, ARBME } from '@arbme/core-lib'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

// Known tokens - instant lookup, no RPC needed
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  // Core Ecosystem
  [ARBME.address.toLowerCase()]: { symbol: 'ARBME', decimals: 18 },
  '0x392bc5deea227043d69af0e67badcbbaed511b07': { symbol: 'RATCHET', decimals: 18 },
  '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292': { symbol: 'CHAOS', decimals: 18 },
  '0x8c19a8b92fa406ae097eb9ea8a4a44cbc10eafe2': { symbol: 'ALPHACLAW', decimals: 18 },
  '0x5c0872b790bb73e2b3a9778db6e7704095624b07': { symbol: 'ABC', decimals: 18 },
  '0xc4730f86d1f86ce0712a7b17ee919db7defad7fe': { symbol: 'PAGE', decimals: 18 },
  // Connected Tokens
  '0xa448d40f6793773938a6b7427091c35676899125': { symbol: 'MLTL', decimals: 18 },
  '0xb695559b26bb2c9703ef1935c37aeae9526bab07': { symbol: 'MOLT', decimals: 18 },
  '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb': { symbol: 'CLANKER', decimals: 18 },
  '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b': { symbol: 'BNKR', decimals: 18 },
  '0x53ad48291407e16e29822deb505b30d47f965ebb': { symbol: 'CLAWD', decimals: 18 },
  '0xf3bb567d4c79cb32d92b9db151255cdd3b91f04a': { symbol: 'OPENCLAW', decimals: 18 },
  '0xc3a366c03a0fc57d96065e3adb27dd0036d83b80': { symbol: 'WOLF', decimals: 18 },
  '0x1966a17d806a79f742e6e228ecc9421f401a8a32': { symbol: 'EDGE', decimals: 18 },
  '0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e': { symbol: 'OSO', decimals: 18 },
  '0x01de044ad8eb037334ddda97a38bb0c798e4eb07': { symbol: 'CNEWS', decimals: 18 },
  // Base Assets
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  '0x000000000d564d5be76f7f0d28fe52605afc7cf8': { symbol: 'flETH', decimals: 18 },
  // Other known tokens
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'cbBTC', decimals: 8 },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', decimals: 18 },
  '0x4ed4e862860bed51a9570b96d89af5e1b0efefed': { symbol: 'DEGEN', decimals: 18 },
}

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

    // Check known tokens first (instant, no RPC)
    const knownToken = KNOWN_TOKENS[address.toLowerCase()]
    if (knownToken) {
      return NextResponse.json({
        address,
        symbol: knownToken.symbol,
        decimals: knownToken.decimals,
      })
    }

    // Fall back to RPC for unknown tokens
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
