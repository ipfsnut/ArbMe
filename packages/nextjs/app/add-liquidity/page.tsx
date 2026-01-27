'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useWallet, useIsFarcaster } from '@/hooks/useWallet'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { BackButton } from '@/components/BackButton'
import { TokenInput } from '@/components/TokenInput'
import { FeeTierSelector } from '@/components/FeeTierSelector'
import { StepIndicator } from '@/components/StepIndicator'
import { ROUTES, ARBME_ADDRESS, WETH_ADDRESS, V2_ROUTER, V3_POSITION_MANAGER, V4_POSITION_MANAGER, V3_FEE_TIERS, V4_FEE_TIERS } from '@/utils/constants'
import sdk from '@farcaster/miniapp-sdk'
import { useSendTransaction } from 'wagmi'

const API_BASE = '/api'

// Format a number without scientific notation
function formatDecimal(num: number): string {
  if (num === 0) return '0'
  if (num >= 1) return num.toFixed(6)
  // For small numbers, find how many decimal places we need
  const str = num.toFixed(20)
  // Remove trailing zeros but keep at least 4 significant digits
  const match = str.match(/^0\.(0*)([1-9]\d{0,9})/)
  if (match) {
    const zeros = match[1].length
    const significant = match[2]
    // Show at least 4 significant digits
    const digitsToShow = Math.max(4, Math.min(significant.length, 8))
    return num.toFixed(zeros + digitsToShow)
  }
  return num.toFixed(10)
}

type Step = 1 | 2 | 3
type Version = 'V2' | 'V3' | 'V4'
type TxStatus = 'idle' | 'checking' | 'approving' | 'creating' | 'success' | 'error'
type ApprovalStatus = 'idle' | 'signing' | 'confirming' | 'confirmed' | 'error'

interface TokenInfo {
  address: string
  symbol: string
  decimals: number
  balance?: string
}

interface FlowState {
  step: Step
  // Step 1: Token & Fee Selection
  version: Version
  token0Address: string
  token1Address: string
  token0Info: TokenInfo | null
  token1Info: TokenInfo | null
  fee: number
  poolExists: boolean | null
  currentPoolPrice: number | null
  currentPoolPriceDisplay: string | null
  // Step 2: Price Setting (USD-based)
  token0UsdPrice: string // User-set USD price for token0
  token1UsdPrice: string // User-set USD price for token1
  token0FetchedUsdPrice: number | null // Fetched USD price for token0 (if available)
  token1FetchedUsdPrice: number | null // Fetched USD price for token1 (if available)
  // Step 3: Deposit & Confirm
  amount0: string
  amount1: string
  // Approval tracking - for V4 we track both ERC20->Permit2 and Permit2->PM approvals
  approvalsChecked: boolean
  token0NeedsErc20Approval: boolean
  token0NeedsPermit2Approval: boolean
  token1NeedsErc20Approval: boolean
  token1NeedsPermit2Approval: boolean
  token0ApprovalStatus: ApprovalStatus
  token1ApprovalStatus: ApprovalStatus
  token0ApprovalError: string | null
  token1ApprovalError: string | null
  txStatus: TxStatus
  txError: string | null
}

const COMMON_TOKENS = [
  { address: ARBME_ADDRESS, symbol: 'ARBME' },
  { address: '0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07', symbol: 'RATCHET' },
  { address: '0xc4730f86d1F86cE0712a7b17EE919Db7deFAD7FE', symbol: 'PAGE' },
  { address: '0x5c0872b790Bb73e2B3A9778Db6E7704095624b07', symbol: 'ABC' },
  { address: WETH_ADDRESS, symbol: 'WETH' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' },
  { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', symbol: 'DEGEN' },
  { address: '0x1bc0c42215582d5A085795f4bADbAc3ff36d1Bcb', symbol: 'CLANKER' },
]

const SPENDERS: Record<Version, string> = {
  V2: V2_ROUTER,
  V3: V3_POSITION_MANAGER,
  V4: V4_POSITION_MANAGER,
}

const STEPS = [
  { number: 1, label: 'Tokens' },
  { number: 2, label: 'Price' },
  { number: 3, label: 'Deposit' },
]

export default function AddLiquidityPage() {
  const wallet = useWallet()
  const isFarcaster = useIsFarcaster()

  // Wagmi hooks for browser wallet
  const { sendTransactionAsync } = useSendTransaction()

  const [state, setState] = useState<FlowState>({
    step: 1,
    version: 'V4',
    token0Address: ARBME_ADDRESS,
    token1Address: WETH_ADDRESS,
    token0Info: null,
    token1Info: null,
    fee: 3000,
    poolExists: false, // Default to false so users can proceed immediately
    currentPoolPrice: null,
    currentPoolPriceDisplay: null,
    token0UsdPrice: '',
    token1UsdPrice: '',
    token0FetchedUsdPrice: null,
    token1FetchedUsdPrice: null,
    amount0: '',
    amount1: '',
    approvalsChecked: false,
    token0NeedsErc20Approval: true,
    token0NeedsPermit2Approval: true,
    token1NeedsErc20Approval: true,
    token1NeedsPermit2Approval: true,
    token0ApprovalStatus: 'idle',
    token1ApprovalStatus: 'idle',
    token0ApprovalError: null,
    token1ApprovalError: null,
    txStatus: 'idle',
    txError: null,
  })

  const [loadingPrices, setLoadingPrices] = useState(false)
  const [checkingPool, setCheckingPool] = useState(false)

  // Update helper
  const updateState = useCallback((updates: Partial<FlowState>) => {
    setState(prev => ({ ...prev, ...updates }))
  }, [])

  // Fetch token info
  useEffect(() => {
    async function fetchTokenInfo(address: string, setter: (info: TokenInfo | null) => void) {
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        setter(null)
        return
      }

      try {
        const res = await fetch(`${API_BASE}/token-info?address=${address}`)
        if (res.ok) {
          const data = await res.json()
          setter(data)
        }
      } catch (err) {
        console.error('Failed to fetch token info:', err)
      }
    }

    fetchTokenInfo(state.token0Address, (info) => updateState({ token0Info: info }))
    fetchTokenInfo(state.token1Address, (info) => updateState({ token1Info: info }))
  }, [state.token0Address, state.token1Address, updateState])

  // Check pool exists when tokens/version/fee change
  useEffect(() => {
    async function checkPool() {
      if (!state.token0Info || !state.token1Info) {
        updateState({ poolExists: null, currentPoolPrice: null, currentPoolPriceDisplay: null })
        return
      }

      setCheckingPool(true)
      try {
        const res = await fetch(`${API_BASE}/check-pool-exists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: state.version.toLowerCase(),
            token0: state.token0Info.address,
            token1: state.token1Info.address,
            fee: state.version !== 'V2' ? state.fee : undefined,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          updateState({ poolExists: data.exists })

          // If pool exists, fetch current price
          if (data.exists) {
            const priceRes = await fetch(`${API_BASE}/pool-price`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                version: state.version.toLowerCase(),
                token0: state.token0Info.address,
                token1: state.token1Info.address,
                fee: state.version !== 'V2' ? state.fee : undefined,
              }),
            })

            if (priceRes.ok) {
              const priceData = await priceRes.json()
              updateState({
                currentPoolPrice: priceData.price,
                currentPoolPriceDisplay: priceData.priceDisplay,
              })
            }
          } else {
            updateState({ currentPoolPrice: null, currentPoolPriceDisplay: null })
          }
        }
      } catch (err) {
        console.error('Failed to check pool:', err)
      } finally {
        setCheckingPool(false)
      }
    }

    checkPool()
  }, [state.token0Info, state.token1Info, state.version, state.fee, updateState])

  // Fetch USD prices for both tokens when entering step 2
  useEffect(() => {
    async function fetchUsdPrices() {
      if (state.step !== 2 || !state.token0Info || !state.token1Info) return

      setLoadingPrices(true)
      try {
        const addresses = `${state.token0Info.address},${state.token1Info.address}`
        const res = await fetch(`${API_BASE}/token-price?addresses=${addresses}`)

        if (res.ok) {
          const data = await res.json()
          const prices = data.prices || {}
          const token0Price = prices[state.token0Info.address.toLowerCase()] || 0
          const token1Price = prices[state.token1Info.address.toLowerCase()] || 0

          updateState({
            token0FetchedUsdPrice: token0Price,
            token1FetchedUsdPrice: token1Price,
            // Pre-fill prices if we have fetched prices (formatted without scientific notation)
            token0UsdPrice: token0Price > 0 ? formatDecimal(token0Price) : state.token0UsdPrice,
            token1UsdPrice: token1Price > 0 ? formatDecimal(token1Price) : state.token1UsdPrice,
          })
        }
      } catch (err) {
        console.error('Failed to fetch USD prices:', err)
      } finally {
        setLoadingPrices(false)
      }
    }

    fetchUsdPrices()
  }, [state.step, state.token0Info?.address, state.token1Info?.address])

  // Fetch balances when wallet connects and on step 3 (deposit step)
  useEffect(() => {
    async function fetchBalances() {
      if (!wallet || !state.token0Info || !state.token1Info) return

      try {
        const [bal0, bal1] = await Promise.all([
          fetch(`${API_BASE}/token-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenAddress: state.token0Info.address, walletAddress: wallet }),
          }).then(r => r.json()),
          fetch(`${API_BASE}/token-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenAddress: state.token1Info.address, walletAddress: wallet }),
          }).then(r => r.json()),
        ])

        updateState({
          token0Info: state.token0Info ? { ...state.token0Info, balance: bal0.balanceFormatted } : null,
          token1Info: state.token1Info ? { ...state.token1Info, balance: bal1.balanceFormatted } : null,
        })
      } catch (err) {
        console.error('Failed to fetch balances:', err)
      }
    }

    if (state.step === 3) {
      fetchBalances()
    }
  }, [wallet, state.token0Info?.address, state.token1Info?.address, state.step])

  // Check approvals when entering step 3 - ONLY ONCE per token pair
  useEffect(() => {
    async function checkApprovals() {
      if (state.step !== 3 || !wallet || !state.token0Info || !state.token1Info || !state.amount0 || !state.amount1) {
        return
      }

      // Don't re-check if already checked for this combination
      if (state.approvalsChecked) {
        return
      }

      console.log('[Approvals] Checking on-chain approval status...')

      try {
        const spender = SPENDERS[state.version]
        const amount0Wei = BigInt(Math.floor(parseFloat(state.amount0) * Math.pow(10, state.token0Info.decimals))).toString()
        const amount1Wei = BigInt(Math.floor(parseFloat(state.amount1) * Math.pow(10, state.token1Info.decimals))).toString()

        const res = await fetch(`${API_BASE}/check-approvals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token0: state.token0Info.address,
            token1: state.token1Info.address,
            owner: wallet,
            spender,
            amount0Required: amount0Wei,
            amount1Required: amount1Wei,
            version: state.version,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          console.log('[Approvals] Check result:', data)

          if (state.version === 'V4') {
            // V4 has two-step approval
            const token0Done = !data.token0.needsErc20Approval && !data.token0.needsPermit2Approval
            const token1Done = !data.token1.needsErc20Approval && !data.token1.needsPermit2Approval

            updateState({
              approvalsChecked: true,
              token0NeedsErc20Approval: data.token0.needsErc20Approval,
              token0NeedsPermit2Approval: data.token0.needsPermit2Approval,
              token1NeedsErc20Approval: data.token1.needsErc20Approval,
              token1NeedsPermit2Approval: data.token1.needsPermit2Approval,
              token0ApprovalStatus: token0Done ? 'confirmed' : 'idle',
              token1ApprovalStatus: token1Done ? 'confirmed' : 'idle',
            })
          } else {
            // V2/V3 - simple single approval
            updateState({
              approvalsChecked: true,
              token0NeedsErc20Approval: data.token0.needsApproval,
              token0NeedsPermit2Approval: false,
              token1NeedsErc20Approval: data.token1.needsApproval,
              token1NeedsPermit2Approval: false,
              token0ApprovalStatus: data.token0.needsApproval ? 'idle' : 'confirmed',
              token1ApprovalStatus: data.token1.needsApproval ? 'idle' : 'confirmed',
            })
          }
        }
      } catch (err) {
        console.error('[Approvals] Check failed:', err)
        // On error, assume approvals needed
        updateState({ approvalsChecked: true })
      }
    }

    checkApprovals()
  }, [state.step, wallet, state.token0Info?.address, state.token1Info?.address, state.amount0, state.amount1, state.version, state.approvalsChecked])

  const sendTransaction = async (tx: { to: string; data: string; value: string }) => {
    if (!wallet) throw new Error('No wallet connected')

    try {
      if (isFarcaster) {
        // Use Farcaster SDK for miniapp
        const provider = await sdk.wallet.getEthereumProvider()
        if (!provider) throw new Error('No wallet provider')

        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: wallet as `0x${string}`,
            to: tx.to as `0x${string}`,
            data: tx.data as `0x${string}`,
            value: tx.value !== '0' ? `0x${BigInt(tx.value).toString(16)}` as `0x${string}` : '0x0',
          }],
        })

        return txHash as string
      } else {
        // Use wagmi for browser wallet
        const txHash = await sendTransactionAsync({
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: tx.value !== '0' ? BigInt(tx.value) : 0n,
        })

        return txHash
      }
    } catch (err: any) {
      // Handle RPC errors - they may have nested error structures
      const message = err?.message || err?.shortMessage || err?.error?.message || 'Transaction failed'
      throw new Error(message)
    }
  }

  // Helper to detect user rejection
  const isUserRejection = (error: any): boolean => {
    const message = error?.message?.toLowerCase() || ''
    const shortMessage = error?.shortMessage?.toLowerCase() || ''
    const combined = message + shortMessage
    return (
      combined.includes('user rejected') ||
      combined.includes('user denied') ||
      combined.includes('rejected the request') ||
      combined.includes('user cancelled') ||
      combined.includes('user canceled') ||
      error?.code === 4001 // Standard EIP-1193 user rejection code
    )
  }

  // Poll tx-receipt API until confirmed or timeout
  const waitForReceipt = async (hash: string): Promise<boolean> => {
    const maxAttempts = 30 // 60 seconds with 2s interval
    const interval = 2000

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(`${API_BASE}/tx-receipt?hash=${hash}`)
        if (!res.ok) {
          console.error('[waitForReceipt] API error:', res.status)
          await new Promise(r => setTimeout(r, interval))
          continue
        }

        const data = await res.json()
        if (data.status === 'success') {
          return true
        } else if (data.status === 'failed') {
          return false
        }
        // status === 'pending', keep polling
      } catch (err) {
        console.error('[waitForReceipt] Fetch error:', err)
      }

      await new Promise(r => setTimeout(r, interval))
    }

    throw new Error('Transaction confirmation timed out')
  }

  const handleApprove = async (token: 'token0' | 'token1') => {
    if (!wallet || !state.token0Info || !state.token1Info) return

    const statusKey = token === 'token0' ? 'token0ApprovalStatus' : 'token1ApprovalStatus'
    const errorKey = token === 'token0' ? 'token0ApprovalError' : 'token1ApprovalError'
    const tokenInfo = token === 'token0' ? state.token0Info : state.token1Info
    const needsErc20Key = token === 'token0' ? 'token0NeedsErc20Approval' : 'token1NeedsErc20Approval'
    const needsPermit2Key = token === 'token0' ? 'token0NeedsPermit2Approval' : 'token1NeedsPermit2Approval'
    const needsErc20 = token === 'token0' ? state.token0NeedsErc20Approval : state.token1NeedsErc20Approval
    const needsPermit2 = token === 'token0' ? state.token0NeedsPermit2Approval : state.token1NeedsPermit2Approval

    // Set to signing state
    updateState({ [statusKey]: 'signing', [errorKey]: null })

    try {
      // V4 requires two-step approval: ERC20 -> Permit2, then Permit2 -> V4 PM
      // But only do the steps that are actually needed!
      if (state.version === 'V4') {
        // Step 1: ERC20 approve to Permit2 (only if needed)
        if (needsErc20) {
          console.log('[V4 Approval] Step 1: Approving token to Permit2...')
          const res1 = await fetch(`${API_BASE}/build-approval`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: tokenInfo.address,
              version: 'V4',
              approvalType: 'erc20',
            }),
          })

          if (!res1.ok) {
            const data = await res1.json().catch(() => ({}))
            throw new Error(data?.error || 'Failed to build ERC20 approval')
          }

          const data1 = await res1.json()
          if (!data1.transaction) {
            throw new Error('No ERC20 approval transaction returned')
          }

          // Send ERC20 approval tx
          let txHash1: string
          try {
            txHash1 = await sendTransaction(data1.transaction)
          } catch (err: any) {
            if (isUserRejection(err)) {
              updateState({ [statusKey]: 'error', [errorKey]: 'Transaction cancelled' })
              return
            }
            throw err
          }

          updateState({ [statusKey]: 'confirming' })
          const success1 = await waitForReceipt(txHash1)
          if (!success1) {
            updateState({ [statusKey]: 'error', [errorKey]: 'ERC20 approval failed on-chain' })
            return
          }

          // Mark ERC20 approval as done
          updateState({ [needsErc20Key]: false })
        } else {
          console.log('[V4 Approval] Step 1 skipped - ERC20 already approved to Permit2')
        }

        // Step 2: Permit2.approve to V4 Position Manager (only if needed)
        if (needsPermit2) {
          console.log('[V4 Approval] Step 2: Granting Permit2 allowance to V4 PM...')
          updateState({ [statusKey]: 'signing' })

          const res2 = await fetch(`${API_BASE}/build-approval`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: tokenInfo.address,
              version: 'V4',
              approvalType: 'permit2',
            }),
          })

          if (!res2.ok) {
            const data = await res2.json().catch(() => ({}))
            throw new Error(data?.error || 'Failed to build Permit2 approval')
          }

          const data2 = await res2.json()
          if (!data2.transaction) {
            throw new Error('No Permit2 approval transaction returned')
          }

          // Send Permit2 approval tx
          let txHash2: string
          try {
            txHash2 = await sendTransaction(data2.transaction)
          } catch (err: any) {
            if (isUserRejection(err)) {
              updateState({ [statusKey]: 'error', [errorKey]: 'Transaction cancelled' })
              return
            }
            throw err
          }

          updateState({ [statusKey]: 'confirming' })
          const success2 = await waitForReceipt(txHash2)

          if (!success2) {
            updateState({ [statusKey]: 'error', [errorKey]: 'Permit2 approval failed on-chain' })
            return
          }

          // Mark Permit2 approval as done
          updateState({ [needsPermit2Key]: false })
        } else {
          console.log('[V4 Approval] Step 2 skipped - Permit2 already approved to V4 PM')
        }

        // All done!
        updateState({ [statusKey]: 'confirmed', [errorKey]: null })
        return
      }

      // V2/V3: Standard single ERC20 approval (only if needed)
      if (!needsErc20) {
        console.log('[Approval] Skipped - already approved')
        updateState({ [statusKey]: 'confirmed', [errorKey]: null })
        return
      }

      const spender = SPENDERS[state.version]
      const res = await fetch(`${API_BASE}/build-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenInfo.address,
          spender,
          unlimited: true,
        }),
      })

      if (!res.ok) {
        let errorMsg = 'Failed to build approval'
        try {
          const data = await res.json()
          errorMsg = data?.error || errorMsg
        } catch {}
        throw new Error(errorMsg)
      }

      const data = await res.json()
      const { transaction } = data
      if (!transaction) {
        throw new Error('No transaction returned from API')
      }

      // Send transaction and get hash
      let txHash: string
      try {
        txHash = await sendTransaction(transaction)
      } catch (err: any) {
        // Check for user rejection
        if (isUserRejection(err)) {
          updateState({ [statusKey]: 'error', [errorKey]: 'Transaction cancelled' })
          return
        }
        throw err
      }

      // Set to confirming state
      updateState({ [statusKey]: 'confirming' })

      // Wait for confirmation
      const success = await waitForReceipt(txHash)

      if (success) {
        updateState({ [statusKey]: 'confirmed', [errorKey]: null, [needsErc20Key]: false })
      } else {
        updateState({ [statusKey]: 'error', [errorKey]: 'Transaction failed on-chain' })
      }
    } catch (err: any) {
      console.error('Approval failed:', err)
      updateState({
        [statusKey]: 'error',
        [errorKey]: err.message || 'Approval failed',
      })
    }
  }

  const handleCreatePool = async () => {
    if (!wallet || !state.token0Info || !state.token1Info || !state.amount0 || !state.amount1) return

    // Calculate price ratio from USD prices for new pools, or use current pool price
    const priceRatio = state.poolExists && state.currentPoolPrice
      ? state.currentPoolPrice
      : (state.token0UsdPrice && state.token1UsdPrice
          ? parseFloat(state.token0UsdPrice) / parseFloat(state.token1UsdPrice)
          : 0)

    if (!priceRatio || priceRatio <= 0) {
      updateState({ txError: 'Invalid price ratio' })
      return
    }

    try {
      updateState({ txStatus: 'creating', txError: null })

      const requestBody = {
        version: state.version.toLowerCase(),
        token0: state.token0Info.address,
        token1: state.token1Info.address,
        amount0: state.amount0,
        amount1: state.amount1,
        fee: state.version !== 'V2' ? state.fee : undefined,
        price: priceRatio,
        recipient: wallet,
      }

      // For V4 new pools, we need to execute init and mint separately
      // because Farcaster simulates txs before user confirms, and mint would fail
      // if we send both at once (pool doesn't exist yet when mint is simulated)
      if (state.version === 'V4' && !state.poolExists) {
        console.log('[addLiquidity] V4 new pool - executing init and mint separately')

        // Step 1: Get and execute init tx only
        const initRes = await fetch(`${API_BASE}/build-create-pool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...requestBody, initOnly: true }),
        })

        if (!initRes.ok) {
          const data = await initRes.json()
          throw new Error(data.error || 'Failed to build init transaction')
        }

        const initData = await initRes.json()
        if (initData.transactions && initData.transactions.length > 0) {
          const initTx = initData.transactions[0]
          console.log('[addLiquidity] Sending init tx:', initTx.description)

          const initHash = await sendTransaction(initTx)
          console.log('[addLiquidity] Waiting for init confirmation...')
          const initSuccess = await waitForReceipt(initHash)
          if (!initSuccess) {
            throw new Error('Pool initialization failed on-chain')
          }
          console.log('[addLiquidity] Init confirmed!')
        }

        // Step 2: Get and execute mint tx (pool now exists)
        const mintRes = await fetch(`${API_BASE}/build-create-pool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...requestBody, mintOnly: true }),
        })

        if (!mintRes.ok) {
          const data = await mintRes.json()
          throw new Error(data.error || 'Failed to build mint transaction')
        }

        const mintData = await mintRes.json()
        if (mintData.transactions && mintData.transactions.length > 0) {
          const mintTx = mintData.transactions[0]
          console.log('[addLiquidity] Sending mint tx:', mintTx.description)
          await sendTransaction(mintTx)
        }
      } else {
        // For existing pools or V2/V3, use standard flow
        const res = await fetch(`${API_BASE}/build-create-pool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to build transaction')
        }

        const { transactions } = await res.json()

        // Execute transactions
        for (const tx of transactions) {
          console.log('[addLiquidity] Sending tx:', tx.description)
          await sendTransaction(tx)
        }
      }

      updateState({ txStatus: 'success' })
    } catch (err: any) {
      console.error('[addLiquidity] Error:', err)
      updateState({ txError: err.message || 'Transaction failed', txStatus: 'error' })
    }
  }

  const goToStep = (step: Step) => {
    updateState({ step, txError: null })
  }

  // Validation for each step
  const isStep1Valid = state.token0Info && state.token1Info // Don't block on pool check
  const hasValidUsdPrices = state.token0UsdPrice && parseFloat(state.token0UsdPrice) > 0 && state.token1UsdPrice && parseFloat(state.token1UsdPrice) > 0
  const isStep2Valid = state.poolExists ? true : hasValidUsdPrices // Existing pools skip price setting
  const isStep3Valid = state.amount0 && state.amount1 && parseFloat(state.amount0) > 0 && parseFloat(state.amount1) > 0
  const allApproved = state.token0ApprovalStatus === 'confirmed' && state.token1ApprovalStatus === 'confirmed'
  const isApproving = state.token0ApprovalStatus === 'signing' || state.token0ApprovalStatus === 'confirming' ||
                      state.token1ApprovalStatus === 'signing' || state.token1ApprovalStatus === 'confirming'

  // Calculate price ratio from USD prices: token0UsdPrice / token1UsdPrice = token1 per token0
  const calculatedPriceRatio = hasValidUsdPrices
    ? parseFloat(state.token0UsdPrice) / parseFloat(state.token1UsdPrice)
    : null

  // For existing pools, use the current pool price; for new pools, use calculated ratio
  const effectivePriceRatio = state.poolExists && state.currentPoolPrice
    ? state.currentPoolPrice
    : calculatedPriceRatio

  // Get fee tier label
  const getFeeTierLabel = (fee: number) => {
    const tiers = state.version === 'V3' ? V3_FEE_TIERS : V4_FEE_TIERS
    const tier = tiers.find(t => t.value === fee)
    return tier ? tier.label : `${fee / 10000}%`
  }

  // Format USD price for display
  const formatUsd = (price: number) => {
    if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `$${formatDecimal(price)}`
  }

  // Render Step 1: Token & Fee Selection
  const renderStep1 = () => (
    <div className="step-content">
      <div className="create-pool-card">
        {/* Version Selector */}
        <div className="create-section">
          <h3 className="section-title">Protocol Version</h3>
          <div className="version-selector">
            {(['V2', 'V3', 'V4'] as Version[]).map((v) => (
              <button
                key={v}
                className={`version-btn ${state.version === v ? 'selected' : ''}`}
                onClick={() => updateState({ version: v })}
              >
                <span className={`version-badge ${v.toLowerCase()}`}>{v}</span>
                <span className="version-desc">
                  {v === 'V2' && 'Simple'}
                  {v === 'V3' && 'Concentrated'}
                  {v === 'V4' && 'Hooks'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Token Selection */}
        <div className="create-section">
          <h3 className="section-title">Token Pair</h3>
          <div className="token-selector-group">
            <label className="token-selector-label">Token 1</label>
            <select
              className="token-select"
              value={COMMON_TOKENS.find(t => t.address === state.token0Address) ? state.token0Address : ''}
              onChange={(e) => updateState({ token0Address: e.target.value })}
            >
              {COMMON_TOKENS.map((t) => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
              <option value="">Custom...</option>
            </select>
            {!COMMON_TOKENS.find(t => t.address === state.token0Address) && (
              <input
                type="text"
                className="token-custom-input"
                placeholder="Enter token address"
                value={state.token0Address}
                onChange={(e) => updateState({ token0Address: e.target.value })}
              />
            )}
            {state.token0Info && (
              <div className="token-selected-info">
                <span className="token-symbol">{state.token0Info.symbol}</span>
              </div>
            )}
          </div>

          <div className="token-selector-group">
            <label className="token-selector-label">Token 2</label>
            <select
              className="token-select"
              value={COMMON_TOKENS.find(t => t.address === state.token1Address) ? state.token1Address : ''}
              onChange={(e) => updateState({ token1Address: e.target.value })}
            >
              {COMMON_TOKENS.map((t) => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
              <option value="">Custom...</option>
            </select>
            {!COMMON_TOKENS.find(t => t.address === state.token1Address) && (
              <input
                type="text"
                className="token-custom-input"
                placeholder="Enter token address"
                value={state.token1Address}
                onChange={(e) => updateState({ token1Address: e.target.value })}
              />
            )}
            {state.token1Info && (
              <div className="token-selected-info">
                <span className="token-symbol">{state.token1Info.symbol}</span>
              </div>
            )}
          </div>
        </div>

        {/* Fee Tier (V3/V4 only) */}
        {state.version !== 'V2' && (
          <div className="create-section">
            <h3 className="section-title">Fee Tier</h3>
            <FeeTierSelector
              value={state.fee}
              onChange={(fee) => updateState({ fee })}
              tiers={state.version === 'V3' ? V3_FEE_TIERS : V4_FEE_TIERS}
            />
          </div>
        )}

        {/* Pool Status */}
        {state.token0Info && state.token1Info && (
          <div className="create-section">
            <div className={`fee-warning`} style={{
              background: checkingPool ? 'rgba(100, 100, 100, 0.1)' : state.poolExists ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 193, 7, 0.1)',
              borderColor: checkingPool ? 'var(--border)' : state.poolExists ? 'var(--positive)' : 'rgba(255, 193, 7, 0.3)',
              color: checkingPool ? 'var(--text-muted)' : state.poolExists ? 'var(--positive)' : '#ffb84d',
            }}>
              {checkingPool ? (
                'Checking pool status...'
              ) : state.poolExists ? (
                <>Pool exists - adding to existing liquidity</>
              ) : (
                'New pool - you will set the initial price'
              )}
            </div>
          </div>
        )}

        {/* WETH Info - show if either token is WETH */}
        {(state.token0Address.toLowerCase() === WETH_ADDRESS.toLowerCase() ||
          state.token1Address.toLowerCase() === WETH_ADDRESS.toLowerCase()) && (
          <div className="create-section">
            <div className="fee-warning" style={{
              background: 'rgba(100, 100, 100, 0.1)',
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}>
              This pool uses WETH. Need to convert ETH to WETH?{' '}
              <Link href={ROUTES.WRAP} style={{ color: 'var(--primary)' }}>
                Wrap ETH →
              </Link>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="step-navigation">
          <button
            className="btn-next"
            onClick={() => goToStep(2)}
            disabled={!isStep1Valid}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )

  // Render Step 2: Price Setting (USD-based)
  const renderStep2 = () => (
    <div className="step-content">
      <div className="create-pool-card">
        {/* Pool Info Banner */}
        <div className="pool-info-banner">
          <div className="pool-info-icon">
            {state.poolExists ? '💧' : '✨'}
          </div>
          <div className="pool-info-content">
            <div className="pool-info-pair">
              {state.token0Info?.symbol} / {state.token1Info?.symbol}
              {state.version !== 'V2' && ` (${getFeeTierLabel(state.fee)})`}
            </div>
            <div className={`pool-info-status ${state.poolExists ? 'exists' : 'new'}`}>
              {state.poolExists ? 'Adding to existing pool' : 'Creating new pool'}
            </div>
          </div>
          <span className={`version-badge ${state.version.toLowerCase()}`}>{state.version}</span>
        </div>

        {/* Pool Exists - Show current price */}
        {state.poolExists && (
          <div className="create-section">
            <h3 className="section-title">Current Pool Price</h3>
            {state.currentPoolPriceDisplay && (
              <div className="current-price-display">
                <div className="current-price-label">Market Price</div>
                <div className="current-price-value">{state.currentPoolPriceDisplay}</div>
              </div>
            )}
            <div className="fee-warning" style={{
              background: 'rgba(34, 197, 94, 0.1)',
              borderColor: 'var(--positive)',
              color: 'var(--positive)',
              marginTop: 'var(--spacing-md)',
            }}>
              This pool already exists. Your liquidity will be added at the current market price.
            </div>
          </div>
        )}

        {/* New Pool - USD Price Setting */}
        {!state.poolExists && (
          <div className="create-section">
            <h3 className="section-title">Set Token Price (USD)</h3>

            {loadingPrices ? (
              <div className="loading-state" style={{ padding: '1rem' }}>
                <div className="loading-spinner" />
                <p>Fetching market prices...</p>
              </div>
            ) : (
              <div className="price-input-section">
                {/* Token 0 USD Price */}
                <div className="input-group">
                  <label className="input-label">
                    <span>{state.token0Info?.symbol} Price (USD)</span>
                    {state.token0FetchedUsdPrice && state.token0FetchedUsdPrice > 0 && (
                      <span className="input-hint" style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                        Market: {formatUsd(state.token0FetchedUsdPrice)}
                      </span>
                    )}
                  </label>
                  <div className="input-wrapper">
                    <span className="input-prefix">$</span>
                    <input
                      type="number"
                      className="amount-input"
                      placeholder="0.00"
                      value={state.token0UsdPrice}
                      onChange={(e) => updateState({ token0UsdPrice: e.target.value })}
                      step="any"
                    />
                  </div>
                </div>

                {/* Token 1 USD Price */}
                <div className="input-group">
                  <label className="input-label">
                    <span>{state.token1Info?.symbol} Price (USD)</span>
                    {state.token1FetchedUsdPrice && state.token1FetchedUsdPrice > 0 && (
                      <span className="input-hint" style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                        Market: {formatUsd(state.token1FetchedUsdPrice)}
                      </span>
                    )}
                  </label>
                  <div className="input-wrapper">
                    <span className="input-prefix">$</span>
                    <input
                      type="number"
                      className="amount-input"
                      placeholder="0.00"
                      value={state.token1UsdPrice}
                      onChange={(e) => updateState({ token1UsdPrice: e.target.value })}
                      step="any"
                    />
                  </div>
                </div>

                {/* Calculated Price Ratio */}
                {calculatedPriceRatio && calculatedPriceRatio > 0 && (
                  <div className="initial-price-display">
                    <span className="price-label">Calculated Pool Price</span>
                    <span className="price-value">
                      1 {state.token0Info?.symbol} = {calculatedPriceRatio.toFixed(10)} {state.token1Info?.symbol}
                    </span>
                  </div>
                )}

                <div className="fee-warning" style={{
                  background: 'rgba(255, 193, 7, 0.1)',
                  borderColor: 'rgba(255, 193, 7, 0.3)',
                  color: '#ffb84d',
                  marginTop: 'var(--spacing-md)',
                }}>
                  You are setting the initial price for this pool. The price ratio is calculated from the USD values you enter.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="step-navigation">
          <button className="btn-back" onClick={() => goToStep(1)}>
            Back
          </button>
          <button
            className="btn-next"
            onClick={() => goToStep(3)}
            disabled={!isStep2Valid || loadingPrices}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )

  // Render Step 3: Deposit & Confirm
  const renderStep3 = () => {
    // Success state
    if (state.txStatus === 'success') {
      return (
        <div className="step-content">
          <div className="create-pool-card">
            <div className="success-state">
              <div className="success-icon">✅</div>
              <h2 className="success-title">Position Created!</h2>
              <p className="success-message">
                Your liquidity has been successfully added to the {state.token0Info?.symbol}/{state.token1Info?.symbol} pool.
              </p>
              <div className="success-actions">
                <Link href={ROUTES.MY_POOLS} className="button-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
                  View My Positions
                </Link>
                <Link href={ROUTES.HOME} className="button-secondary" style={{ textAlign: 'center', textDecoration: 'none' }}>
                  Back to Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="step-content">
        <div className="create-pool-card">
          {/* Pool Info Banner */}
          <div className="pool-info-banner">
            <div className="pool-info-icon">
              {state.poolExists ? '💧' : '✨'}
            </div>
            <div className="pool-info-content">
              <div className="pool-info-pair">
                {state.token0Info?.symbol} / {state.token1Info?.symbol}
                {state.version !== 'V2' && ` (${getFeeTierLabel(state.fee)})`}
              </div>
              <div className="pool-info-price">
                Price: 1 {state.token0Info?.symbol} = {effectivePriceRatio?.toFixed(10)} {state.token1Info?.symbol}
              </div>
            </div>
            <span className={`version-badge ${state.version.toLowerCase()}`}>{state.version}</span>
          </div>

          {/* Deposit Amounts */}
          <div className="create-section">
            <h3 className="section-title">Deposit Amounts</h3>
            <p className="section-hint" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--spacing-md)' }}>
              Amounts are linked based on the price ratio
            </p>
            <div className="amount-inputs">
              <TokenInput
                label={state.token0Info?.symbol || 'Token 1'}
                symbol={state.token0Info?.symbol}
                balance={state.token0Info?.balance}
                value={state.amount0}
                onChange={(amount0) => {
                  // Auto-calculate amount1 based on price ratio
                  if (effectivePriceRatio && amount0 && parseFloat(amount0) > 0) {
                    const calculatedAmount1 = parseFloat(amount0) * effectivePriceRatio
                    updateState({ amount0, amount1: formatDecimal(calculatedAmount1) })
                  } else {
                    updateState({ amount0 })
                  }
                }}
              />

              <TokenInput
                label={state.token1Info?.symbol || 'Token 2'}
                symbol={state.token1Info?.symbol}
                balance={state.token1Info?.balance}
                value={state.amount1}
                onChange={(amount1) => {
                  // Auto-calculate amount0 based on price ratio
                  if (effectivePriceRatio && effectivePriceRatio > 0 && amount1 && parseFloat(amount1) > 0) {
                    const calculatedAmount0 = parseFloat(amount1) / effectivePriceRatio
                    updateState({ amount1, amount0: formatDecimal(calculatedAmount0) })
                  } else {
                    updateState({ amount1 })
                  }
                }}
              />
            </div>
          </div>

          {/* Approvals Section */}
          {isStep3Valid && (
            <div className="approval-section">
              <h3 className="approval-title">Approvals</h3>

              {/* Token 0 Approval */}
              <div className="approval-item">
                <div className="approval-token">
                  <span className="approval-token-symbol">{state.token0Info?.symbol}</span>
                </div>
                {state.token0ApprovalStatus === 'confirmed' ? (
                  <div className="approval-status">
                    <span className="approval-check">✓</span>
                    <span className="approval-text">Approved</span>
                  </div>
                ) : state.token0ApprovalStatus === 'signing' ? (
                  <button className="approval-btn pending" disabled>
                    <span className="loading-spinner small" style={{ marginRight: '0.5rem' }} />
                    Waiting for wallet...
                  </button>
                ) : state.token0ApprovalStatus === 'confirming' ? (
                  <button className="approval-btn pending" disabled>
                    <span className="loading-spinner small" style={{ marginRight: '0.5rem' }} />
                    Confirming...
                  </button>
                ) : (
                  <div className="approval-btn-container">
                    <button
                      className={`approval-btn ${state.token0ApprovalStatus === 'error' ? 'error' : ''}`}
                      onClick={() => handleApprove('token0')}
                      disabled={isApproving}
                    >
                      {state.token0ApprovalStatus === 'error' ? 'Retry Approve' : `Approve ${state.token0Info?.symbol}`}
                    </button>
                    {state.token0ApprovalError && (
                      <span className="approval-error">{state.token0ApprovalError}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Token 1 Approval */}
              <div className="approval-item">
                <div className="approval-token">
                  <span className="approval-token-symbol">{state.token1Info?.symbol}</span>
                </div>
                {state.token1ApprovalStatus === 'confirmed' ? (
                  <div className="approval-status">
                    <span className="approval-check">✓</span>
                    <span className="approval-text">Approved</span>
                  </div>
                ) : state.token1ApprovalStatus === 'signing' ? (
                  <button className="approval-btn pending" disabled>
                    <span className="loading-spinner small" style={{ marginRight: '0.5rem' }} />
                    Waiting for wallet...
                  </button>
                ) : state.token1ApprovalStatus === 'confirming' ? (
                  <button className="approval-btn pending" disabled>
                    <span className="loading-spinner small" style={{ marginRight: '0.5rem' }} />
                    Confirming...
                  </button>
                ) : (
                  <div className="approval-btn-container">
                    <button
                      className={`approval-btn ${state.token1ApprovalStatus === 'error' ? 'error' : ''}`}
                      onClick={() => handleApprove('token1')}
                      disabled={isApproving}
                    >
                      {state.token1ApprovalStatus === 'error' ? 'Retry Approve' : `Approve ${state.token1Info?.symbol}`}
                    </button>
                    {state.token1ApprovalError && (
                      <span className="approval-error">{state.token1ApprovalError}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {state.txError && (
            <div className="tx-error" style={{ marginBottom: '1rem' }}>
              {state.txError}
            </div>
          )}

          {/* Navigation / Submit */}
          <div className="step-navigation">
            <button
              className="btn-back"
              onClick={() => goToStep(2)}
              disabled={state.txStatus === 'creating'}
            >
              Back
            </button>
            <button
              className="btn-next"
              onClick={handleCreatePool}
              disabled={!isStep3Valid || !allApproved || state.txStatus === 'creating'}
            >
              {state.txStatus === 'creating' ? (
                <>
                  <span className="loading-spinner small" style={{ marginRight: '0.5rem' }} />
                  Creating...
                </>
              ) : state.poolExists ? (
                'Add Liquidity'
              ) : (
                'Create Pool'
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <AppHeader />

      <div className="main-content">
        <BackButton href={ROUTES.HOME} label="Back to Home" />

        <div className="section-header">
          <h2>Add Liquidity</h2>
        </div>

        {!wallet ? (
          <div className="empty-state">
            <p>Connect your wallet to add liquidity</p>
            <p className="hint">Your wallet will connect automatically in Farcaster</p>
          </div>
        ) : (
          <>
            <StepIndicator steps={STEPS} currentStep={state.step} />

            {state.step === 1 && renderStep1()}
            {state.step === 2 && renderStep2()}
            {state.step === 3 && renderStep3()}
          </>
        )}
      </div>

      <Footer />
    </div>
  )
}
