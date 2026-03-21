import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, encodeFunctionData } from 'viem'
import { base } from 'viem/chains'

const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const
const UNIVERSAL_ROUTER = '0x6ff5693b99212da76ad316178a184ab56d299b43' as const
const V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as const
const V2_ROUTER = '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24' as const

// All tokens the app supports
const SUPPORTED_TOKENS: { symbol: string; address: `0x${string}` }[] = [
  { symbol: 'ARBME', address: '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07' },
  { symbol: 'RATCHET', address: '0x392bc5deea227043d69af0e67badcbbaed511b07' },
  { symbol: 'CHAOSLP', address: '0x8454d062506a27675706148ecdd194e45e44067a' },
  { symbol: 'CHAOS', address: '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292' },
  { symbol: 'ABC', address: '0x5c0872b790bb73e2b3a9778db6e7704095624b07' },
  { symbol: 'FLAY', address: '0xf1a7000000950c7ad8aff13118bb7ab561a448ee' },
  { symbol: 'VIRTUAL', address: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b' },
  { symbol: 'CLANKER', address: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb' },
  { symbol: 'USDC', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
  { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006' },
  { symbol: 'BNKR', address: '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b' },
  { symbol: 'CNEWS', address: '0x01de044ad8eb037334ddda97a38bb0c798e4eb07' },
  { symbol: 'PAGE', address: '0xc4730f86d1f86ce0712a7b17ee919db7defad7fe' },
]

const erc20Abi = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

const permit2Abi = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'token', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }], outputs: [] },
] as const

function getClient() {
  const key = process.env.ALCHEMY_API_KEY
  const rpcUrl = key ? `https://base-mainnet.g.alchemy.com/v2/${key}` : 'https://base-rpc.publicnode.com'
  return createPublicClient({ chain: base, transport: http(rpcUrl) })
}

export async function POST(request: NextRequest) {
  try {
    const { owner } = await request.json()
    if (!owner || !/^0x[a-fA-F0-9]{40}$/.test(owner)) {
      return NextResponse.json({ error: 'Invalid owner address' }, { status: 400 })
    }

    const client = getClient()
    const spenders = [PERMIT2, UNIVERSAL_ROUTER, V3_ROUTER, V2_ROUTER]
    const revokeTxs: { symbol: string; type: string; transaction: { to: string; data: string; value: string; gas: string } }[] = []

    // Check all ERC20 allowances to all spenders
    await Promise.all(SUPPORTED_TOKENS.map(async (token) => {
      // Check ERC20 allowances to Permit2 and routers
      const allowanceChecks = spenders.map(async (spender) => {
        try {
          const allowance = await client.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [owner as `0x${string}`, spender as `0x${string}`],
          })
          if (allowance > 0n) {
            const spenderName = spender === PERMIT2 ? 'Permit2' :
              spender === UNIVERSAL_ROUTER ? 'V4 Router' :
              spender === V3_ROUTER ? 'V3 Router' : 'V2 Router'
            revokeTxs.push({
              symbol: token.symbol,
              type: `ERC20 → ${spenderName}`,
              transaction: {
                to: token.address,
                data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender as `0x${string}`, 0n] }),
                value: '0',
                gas: '100000',
              },
            })
          }
        } catch { /* skip tokens that fail */ }
      })

      // Check Permit2 allowances to Universal Router
      try {
        const [amount] = await client.readContract({
          address: PERMIT2,
          abi: permit2Abi,
          functionName: 'allowance',
          args: [owner as `0x${string}`, token.address, UNIVERSAL_ROUTER],
        })
        if (amount > 0n) {
          revokeTxs.push({
            symbol: token.symbol,
            type: 'Permit2 → V4 Router',
            transaction: {
              to: PERMIT2,
              data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [token.address, UNIVERSAL_ROUTER, 0n, 0] }),
              value: '0',
              gas: '100000',
            },
          })
        }
      } catch { /* skip */ }

      await Promise.all(allowanceChecks)
    }))

    return NextResponse.json({
      success: true,
      count: revokeTxs.length,
      revokeTxs,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to check approvals' }, { status: 500 })
  }
}
