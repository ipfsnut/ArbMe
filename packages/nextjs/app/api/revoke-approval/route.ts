import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, encodeFunctionData } from 'viem'
import { base } from 'viem/chains'

const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const
const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')

const erc20Abi = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

function getClient() {
  const key = process.env.ALCHEMY_API_KEY
  const rpcUrl = key ? `https://base-mainnet.g.alchemy.com/v2/${key}` : 'https://base-rpc.publicnode.com'
  return createPublicClient({ chain: base, transport: http(rpcUrl) })
}

export async function POST(request: NextRequest) {
  try {
    const { token, spender, step, owner } = await request.json()

    if (!token || !/^0x[a-fA-F0-9]{40}$/.test(token)) {
      return NextResponse.json({ error: 'Invalid token address' }, { status: 400 })
    }

    if (step === 'erc20') {
      // Check if token has hardcoded Permit2 allowance (Clanker/Flaunch)
      if (owner && /^0x[a-fA-F0-9]{40}$/.test(owner)) {
        try {
          const client = getClient()
          const allowance = await client.readContract({
            address: token as `0x${string}`,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [owner as `0x${string}`, PERMIT2],
          })
          if (allowance === MAX_UINT256) {
            return NextResponse.json({
              success: true,
              skipped: true,
              reason: 'Token has hardcoded Permit2 allowance (cannot be revoked)',
            })
          }
        } catch { /* proceed with revoke attempt */ }
      }

      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [PERMIT2, 0n],
      })
      return NextResponse.json({
        success: true,
        transaction: { to: token, data, value: '0', gas: '100000' },
        description: 'Revoke ERC20 approval to Permit2',
      })
    }

    if (step === 'permit2') {
      if (!spender || !/^0x[a-fA-F0-9]{40}$/.test(spender)) {
        return NextResponse.json({ error: 'Invalid spender address' }, { status: 400 })
      }
      const data = encodeFunctionData({
        abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }], outputs: [] }],
        functionName: 'approve',
        args: [token as `0x${string}`, spender as `0x${string}`, 0n, 0],
      })
      return NextResponse.json({
        success: true,
        transaction: { to: PERMIT2, data, value: '0', gas: '100000' },
        description: 'Revoke Permit2 approval to router',
      })
    }

    return NextResponse.json({ error: 'Invalid step: must be "erc20" or "permit2"' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to build revoke tx' }, { status: 500 })
  }
}
