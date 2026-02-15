import { NextResponse } from 'next/server'
import { formatUnits, formatEther } from 'viem'
import { getTokenPrices, KNOWN_TOKENS } from '@arbme/core-lib'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

const MULTISIG_ADDRESS = '0xc35c2dCdD084F1Df8a4dDbD374436E35136b4368'

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'

export async function GET() {
  const rpcUrl = ALCHEMY_KEY
    ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
    : 'https://mainnet.base.org'

  const paddedMultisig = '000000000000000000000000' + MULTISIG_ADDRESS.slice(2).toLowerCase()

  try {
    // Build batch RPC request — 1 eth_getBalance + N balanceOf calls, all in one request
    const calls: Array<{ jsonrpc: string; id: number; method: string; params: any[] }> = []

    // ETH balance
    calls.push({
      jsonrpc: '2.0',
      id: 0,
      method: 'eth_getBalance',
      params: [MULTISIG_ADDRESS, 'latest'],
    })

    // Token balances via balanceOf(address)
    const tokenEntries = Object.entries(KNOWN_TOKENS)
    for (let i = 0; i < tokenEntries.length; i++) {
      const [address] = tokenEntries[i]
      calls.push({
        jsonrpc: '2.0',
        id: i + 1,
        method: 'eth_call',
        params: [{ to: address, data: '0x70a08231' + paddedMultisig }, 'latest'],
      })
    }

    // Single batch RPC request
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calls),
    })

    const rpcResults = await rpcResponse.json()

    // Parse ETH balance
    const ethResult = rpcResults.find((r: any) => r.id === 0)
    let ethBalance = 0
    if (ethResult?.result) {
      ethBalance = parseFloat(formatEther(BigInt(ethResult.result)))
    }

    // Parse token balances
    const tokensWithBalance: Array<{
      address: string
      symbol: string
      balance: number
    }> = []

    for (let i = 0; i < tokenEntries.length; i++) {
      const [address, token] = tokenEntries[i]
      const result = rpcResults.find((r: any) => r.id === i + 1)

      if (result?.result && result.result !== '0x' && result.result !== '0x0') {
        const balance = parseFloat(formatUnits(BigInt(result.result), token.decimals))
        if (balance > 0) {
          tokensWithBalance.push({ address, symbol: token.symbol, balance })
        }
      }
    }

    // Fetch prices for all tokens that have balances + WETH for ETH pricing
    const priceAddresses = tokensWithBalance.map(t => t.address)
    if (!priceAddresses.includes(WETH_ADDRESS.toLowerCase())) {
      priceAddresses.push(WETH_ADDRESS.toLowerCase())
    }

    let prices: Record<string, number> = {}
    if (priceAddresses.length > 0) {
      const priceMap = await getTokenPrices(priceAddresses, ALCHEMY_KEY)
      for (const [addr, price] of priceMap) {
        prices[addr] = price
      }
    }

    // Build response
    const wethPrice = prices[WETH_ADDRESS.toLowerCase()] || 0
    const ethValueUsd = ethBalance * wethPrice

    const assets = tokensWithBalance.map(t => {
      const priceUsd = prices[t.address] || 0
      return {
        address: t.address,
        symbol: t.symbol,
        balance: t.balance,
        priceUsd,
        valueUsd: t.balance * priceUsd,
      }
    })

    // Sort by USD value descending
    assets.sort((a, b) => b.valueUsd - a.valueUsd)

    const totalValue = ethValueUsd + assets.reduce((sum, a) => sum + a.valueUsd, 0)

    return NextResponse.json({
      ethBalance,
      ethPriceUsd: wethPrice,
      ethValueUsd,
      assets,
      totalValue,
    })
  } catch (error: any) {
    console.error('[Treasury API] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch treasury data' }, { status: 500 })
  }
}
