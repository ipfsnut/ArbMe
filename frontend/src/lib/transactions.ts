import { parseUnits } from 'viem'
import {
  CONTRACTS,
  SELECTORS,
  MAX_UINT160,
  FAR_FUTURE_EXPIRATION,
  GAS_LIMITS,
} from './constants'
import { API_BASE_URL } from './wagmi'

// Types
export interface TokenInfo {
  address: string
  symbol: string
  decimals: number
}

export interface TransactionRequest {
  from: string
  to: string
  data: string
  gas?: string
  value?: string
}

export interface ApprovalStatus {
  erc20ToPermit2: boolean
  permit2ToSpender: boolean
}

// Helper to pad hex values
function padHex(value: string, length: number): string {
  return value.replace('0x', '').toLowerCase().padStart(length, '0')
}

// Sort tokens for V4 (currency0 < currency1)
export function sortTokens(
  tokenA: TokenInfo,
  tokenB: TokenInfo,
  amountA: number,
  amountB: number
): {
  currency0: string
  currency1: string
  amount0: number
  amount1: number
  decimals0: number
  decimals1: number
  symbol0: string
  symbol1: string
} {
  const addrA = tokenA.address.toLowerCase()
  const addrB = tokenB.address.toLowerCase()

  if (addrA < addrB) {
    return {
      currency0: tokenA.address,
      currency1: tokenB.address,
      amount0: amountA,
      amount1: amountB,
      decimals0: tokenA.decimals,
      decimals1: tokenB.decimals,
      symbol0: tokenA.symbol,
      symbol1: tokenB.symbol,
    }
  } else {
    return {
      currency0: tokenB.address,
      currency1: tokenA.address,
      amount0: amountB,
      amount1: amountA,
      decimals0: tokenB.decimals,
      decimals1: tokenA.decimals,
      symbol0: tokenB.symbol,
      symbol1: tokenA.symbol,
    }
  }
}

// Check allowances
export async function checkAllowances(
  wallet: string,
  token: string,
  spender: string
): Promise<{ allowanceRaw: string; sufficient: boolean }> {
  const res = await fetch(
    `${API_BASE_URL}/test/rpc?action=checkAllowance&wallet=${wallet}&token=${token}&spender=${spender}`
  )
  return res.json()
}

export async function checkPermit2Allowance(
  wallet: string,
  token: string,
  spender: string
): Promise<{ allowanceRaw: string; sufficient: boolean }> {
  const res = await fetch(
    `${API_BASE_URL}/test/rpc?action=checkPermit2Allowance&wallet=${wallet}&token=${token}&spender=${spender}`
  )
  return res.json()
}

// Build ERC20 approve transaction
export function buildApproveTransaction(
  from: string,
  token: string,
  spender: string,
  amount: bigint
): TransactionRequest {
  const amountHex = padHex(amount.toString(16), 64)
  const spenderPadded = padHex(spender, 64)

  return {
    from,
    to: token,
    data: SELECTORS.approve + spenderPadded + amountHex,
    gas: GAS_LIMITS.APPROVE,
    value: '0x0',
  }
}

// Build Permit2 approve transaction
export function buildPermit2ApproveTransaction(
  from: string,
  token: string,
  spender: string
): TransactionRequest {
  const tokenPadded = padHex(token, 64)
  const spenderPadded = padHex(spender, 64)
  const amountPadded = padHex(MAX_UINT160, 64)

  return {
    from,
    to: CONTRACTS.PERMIT2,
    data:
      SELECTORS.permit2Approve +
      tokenPadded +
      spenderPadded +
      amountPadded +
      FAR_FUTURE_EXPIRATION,
    gas: GAS_LIMITS.APPROVE,
    value: '0x0',
  }
}

// Compute V4 pool ID
// Note: This would require keccak256 - use API endpoint instead
export function computePoolId(): string {
  throw new Error('Use API endpoint to compute poolId')
}

// Build V4 add liquidity calldata
// Note: This is complex ABI encoding - use API endpoint instead
export function buildV4AddLiquidityData(): string {
  throw new Error('Use API endpoint to build V4 calldata')
}

// Helper to wait for transaction confirmation
export async function waitForTransaction(
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
  txHash: string,
  maxWaitMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const receipt = await provider.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      })

      if (receipt) {
        return true
      }
    } catch {
      // Ignore errors, keep polling
    }

    await new Promise(r => setTimeout(r, 2000))
  }

  return false
}

// Execute approval flow for V4
export async function executeV4Approvals(
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
  wallet: string,
  currency0: string,
  currency1: string,
  amount0Raw: bigint,
  amount1Raw: bigint,
  onStatus?: (message: string) => void
): Promise<void> {
  const approve0Amount = (amount0Raw * BigInt(110)) / BigInt(100) // 10% buffer
  const approve1Amount = (amount1Raw * BigInt(110)) / BigInt(100)

  // Check all approvals
  onStatus?.('Checking approvals...')
  const [app0, app1, p2app0, p2app1] = await Promise.all([
    checkAllowances(wallet, currency0, CONTRACTS.PERMIT2),
    checkAllowances(wallet, currency1, CONTRACTS.PERMIT2),
    checkPermit2Allowance(wallet, currency0, CONTRACTS.V4_POSITION_MANAGER),
    checkPermit2Allowance(wallet, currency1, CONTRACTS.V4_POSITION_MANAGER),
  ])

  const app0Sufficient = app0.allowanceRaw && BigInt(app0.allowanceRaw) >= approve0Amount
  const app1Sufficient = app1.allowanceRaw && BigInt(app1.allowanceRaw) >= approve1Amount
  const p2app0Sufficient = p2app0.allowanceRaw && BigInt(p2app0.allowanceRaw) >= approve0Amount
  const p2app1Sufficient = p2app1.allowanceRaw && BigInt(p2app1.allowanceRaw) >= approve1Amount

  // Step 1: ERC20 approve token0 to Permit2
  if (!app0Sufficient) {
    onStatus?.('Approving token0 to Permit2...')
    const tx = buildApproveTransaction(wallet, currency0, CONTRACTS.PERMIT2, approve0Amount)
    await provider.request({ method: 'eth_sendTransaction', params: [tx] })
    await new Promise(r => setTimeout(r, 3000))
  }

  // Step 2: Permit2 approve token0 to PositionManager
  if (!p2app0Sufficient) {
    onStatus?.('Granting Permit2 allowance for token0...')
    const tx = buildPermit2ApproveTransaction(wallet, currency0, CONTRACTS.V4_POSITION_MANAGER)
    await provider.request({ method: 'eth_sendTransaction', params: [tx] })
    await new Promise(r => setTimeout(r, 3000))
  }

  // Step 3: ERC20 approve token1 to Permit2
  if (!app1Sufficient) {
    onStatus?.('Approving token1 to Permit2...')
    const tx = buildApproveTransaction(wallet, currency1, CONTRACTS.PERMIT2, approve1Amount)
    await provider.request({ method: 'eth_sendTransaction', params: [tx] })
    await new Promise(r => setTimeout(r, 3000))
  }

  // Step 4: Permit2 approve token1 to PositionManager
  if (!p2app1Sufficient) {
    onStatus?.('Granting Permit2 allowance for token1...')
    const tx = buildPermit2ApproveTransaction(wallet, currency1, CONTRACTS.V4_POSITION_MANAGER)
    await provider.request({ method: 'eth_sendTransaction', params: [tx] })
    await new Promise(r => setTimeout(r, 3000))
  }
}

// Format token amount for display
export function formatTokenAmount(amount: number, decimals: number = 4): string {
  if (amount === 0) return '0'
  if (amount < 0.0001) return '<0.0001'
  if (amount < 1) return amount.toFixed(4)
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`
  return amount.toFixed(decimals)
}

// Format USD value
export function formatUsd(amount: number): string {
  if (amount < 0.01) return '<$0.01'
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(2)}K`
  return `$${amount.toFixed(2)}`
}

// Parse user input amount to raw bigint
export function parseAmount(amount: string, decimals: number): bigint {
  try {
    return parseUnits(amount, decimals)
  } catch {
    return BigInt(0)
  }
}
