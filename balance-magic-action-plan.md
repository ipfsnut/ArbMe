# Balance Magic - Implementation Action Plan

**Created**: 2026-01-21
**Status**: Ready for Implementation
**Est. Completion**: 8 Phases

---

## Quick Reference

### What We're Building
Transform the LP creation experience with:
- Real-time balance display
- 25/50/75/100% quick select buttons
- Automatic token ratio calculation
- Exact approval amounts (not unlimited)
- User-configurable slippage protection

### Files to Create
- `/packages/nextjs/app/api/token-balance/route.ts`
- `/packages/nextjs/app/api/pool-price/route.ts`
- `/packages/nextjs/app/api/calculate-ratio/route.ts`
- `/packages/nextjs/components/BalanceDisplay.tsx`
- `/packages/nextjs/components/QuickSelectButtons.tsx`
- `/packages/nextjs/components/SlippageControl.tsx`

### Files to Modify
- `/packages/nextjs/services/api.ts` - Add new service functions
- `/packages/nextjs/app/api/build-approval/route.ts` - Support exact amounts
- `/packages/nextjs/app/create-pool/page.tsx` - Add balance magic
- `/packages/nextjs/app/position/[id]/page.tsx` - Add balance magic
- `/packages/nextjs/styles/globals.css` - Add component styles

---

## Phase 1: Backend API - Token Balance

### Create: `/packages/nextjs/app/api/token-balance/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

const PROVIDER_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org'

// Minimal ERC20 ABI
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

export async function POST(request: NextRequest) {
  try {
    const { tokenAddress, walletAddress } = await request.json()

    if (!tokenAddress || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const provider = new ethers.JsonRpcProvider(PROVIDER_URL)
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)

    // Fetch balance and decimals in parallel
    const [balanceWei, decimals] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
    ])

    // Format balance
    const balanceFormatted = ethers.formatUnits(balanceWei, decimals)

    return NextResponse.json({
      balanceWei: balanceWei.toString(),
      balanceFormatted,
      decimals: Number(decimals),
    })
  } catch (error: any) {
    console.error('[token-balance] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch balance' },
      { status: 500 }
    )
  }
}
```

**Test**:
```bash
curl -X POST http://localhost:3000/app/api/token-balance \
  -H "Content-Type: application/json" \
  -d '{"tokenAddress":"0x4200000000000000000000000000000000000006","walletAddress":"0x..."}'
```

---

## Phase 2: Backend API - Pool Price

### Create: `/packages/nextjs/app/api/pool-price/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

const PROVIDER_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org'

// Uniswap V3 Pool ABI (minimal)
const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]

// Factory ABIs for getting pool address
const V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
]

const FACTORY_ADDRESSES = {
  v3: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD', // Base V3 Factory
  v4: '0x7c5f5a4bbd8fd63184577525326123b519429bdc', // Base V4 (if different)
}

export async function POST(request: NextRequest) {
  try {
    const { version, token0, token1, fee } = await request.json()

    if (!version || !token0 || !token1) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    if (version === 'v2') {
      // V2 uses reserves, different calculation
      return NextResponse.json(
        { error: 'V2 price calculation not yet implemented' },
        { status: 501 }
      )
    }

    const provider = new ethers.JsonRpcProvider(PROVIDER_URL)

    // Get pool address from factory
    const factoryAddress = FACTORY_ADDRESSES[version as 'v3' | 'v4']
    const factory = new ethers.Contract(factoryAddress, V3_FACTORY_ABI, provider)
    const poolAddress = await factory.getPool(token0, token1, fee)

    if (poolAddress === ethers.ZeroAddress) {
      return NextResponse.json({
        exists: false,
        price: null,
        priceDisplay: null,
      })
    }

    // Get pool state
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider)
    const slot0 = await pool.slot0()
    const sqrtPriceX96 = slot0.sqrtPriceX96

    // Calculate price from sqrtPriceX96
    // price = (sqrtPriceX96 / 2^96) ^ 2
    const Q96 = ethers.toBigInt(2) ** ethers.toBigInt(96)
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
    const price = sqrtPrice ** 2

    // Get token symbols for display
    const ERC20_ABI = ['function symbol() view returns (string)']
    const token0Contract = new ethers.Contract(token0, ERC20_ABI, provider)
    const token1Contract = new ethers.Contract(token1, ERC20_ABI, provider)

    const [symbol0, symbol1] = await Promise.all([
      token0Contract.symbol(),
      token1Contract.symbol(),
    ])

    const priceDisplay = `1 ${symbol0} = ${price.toFixed(6)} ${symbol1}`

    return NextResponse.json({
      exists: true,
      sqrtPriceX96: sqrtPriceX96.toString(),
      price,
      priceDisplay,
      token0Symbol: symbol0,
      token1Symbol: symbol1,
    })
  } catch (error: any) {
    console.error('[pool-price] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pool price' },
      { status: 500 }
    )
  }
}
```

---

## Phase 3: Backend API - Calculate Ratio

### Create: `/packages/nextjs/app/api/calculate-ratio/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/app/api'

export async function POST(request: NextRequest) {
  try {
    const {
      version,
      token0,
      token1,
      fee,
      amount0,
      amount1,
      decimals0,
      decimals1,
    } = await request.json()

    // Fetch current pool price
    const priceResponse = await fetch(`${API_BASE}/pool-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, token0, token1, fee }),
    })

    if (!priceResponse.ok) {
      throw new Error('Failed to fetch pool price')
    }

    const { exists, price, priceDisplay } = await priceResponse.json()

    if (!exists || !price) {
      return NextResponse.json(
        { error: 'Pool does not exist' },
        { status: 404 }
      )
    }

    let calculatedAmount0: string
    let calculatedAmount1: string

    if (amount0) {
      // User provided amount0, calculate amount1
      calculatedAmount0 = amount0
      calculatedAmount1 = (parseFloat(amount0) * price).toFixed(decimals1)
    } else if (amount1) {
      // User provided amount1, calculate amount0
      calculatedAmount1 = amount1
      calculatedAmount0 = (parseFloat(amount1) / price).toFixed(decimals0)
    } else {
      return NextResponse.json(
        { error: 'Must provide either amount0 or amount1' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      amount0: calculatedAmount0,
      amount1: calculatedAmount1,
      price,
      priceDisplay,
    })
  } catch (error: any) {
    console.error('[calculate-ratio] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to calculate ratio' },
      { status: 500 }
    )
  }
}
```

---

## Phase 4: Backend API - Update Approval

### Modify: `/packages/nextjs/app/api/build-approval/route.ts`

**Add to existing file**:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
]

export async function POST(request: NextRequest) {
  try {
    const { token, spender, amount, unlimited } = await request.json()

    if (!token || !spender) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Determine approval amount
    const isUnlimited = unlimited === true && !amount
    const approvalAmount = isUnlimited
      ? ethers.MaxUint256
      : ethers.parseUnits(amount || '0', 0) // amount should already be in wei

    // Create contract interface
    const iface = new ethers.Interface(ERC20_ABI)

    // Encode the approve function call
    const data = iface.encodeFunctionData('approve', [spender, approvalAmount])

    return NextResponse.json({
      to: token,
      data,
      value: '0x0',
      approvalAmount: approvalAmount.toString(),
      isUnlimited,
    })
  } catch (error: any) {
    console.error('[build-approval] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to build approval' },
      { status: 500 }
    )
  }
}
```

---

## Phase 5: Frontend Services

### Modify: `/packages/nextjs/services/api.ts`

**Add to end of file**:

```typescript
/**
 * Fetch token balance for wallet
 */
export async function fetchTokenBalance(
  tokenAddress: string,
  walletAddress: string
): Promise<{
  balanceWei: string
  balanceFormatted: string
  decimals: number
}> {
  const res = await fetch(`${API_BASE}/token-balance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tokenAddress, walletAddress }),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch token balance: ${res.statusText}`)
  }

  return res.json()
}

/**
 * Fetch pool price
 */
export async function fetchPoolPrice(params: {
  version: string
  token0: string
  token1: string
  fee?: number
}): Promise<{
  exists: boolean
  price?: number
  priceDisplay?: string
  token0Symbol?: string
  token1Symbol?: string
}> {
  const res = await fetch(`${API_BASE}/pool-price`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch pool price: ${res.statusText}`)
  }

  return res.json()
}

/**
 * Calculate liquidity ratio
 */
export async function calculateLiquidityRatio(params: {
  version: string
  token0: string
  token1: string
  fee?: number
  amount0?: string
  amount1?: string
  decimals0: number
  decimals1: number
}): Promise<{
  amount0: string
  amount1: string
  price: number
  priceDisplay: string
}> {
  const res = await fetch(`${API_BASE}/calculate-ratio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    throw new Error(`Failed to calculate ratio: ${res.statusText}`)
  }

  return res.json()
}
```

**Update existing function signature**:

```typescript
// BEFORE
export async function buildApprovalTransaction(
  token: string,
  spender: string
): Promise<{
  to: string
  data: string
  value: string
}> { ... }

// AFTER
export async function buildApprovalTransaction(
  token: string,
  spender: string,
  amount?: string,
  unlimited?: boolean
): Promise<{
  to: string
  data: string
  value: string
  approvalAmount: string
  isUnlimited: boolean
}> {
  const res = await fetch(`${API_BASE}/build-approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, spender, amount, unlimited }),
  })

  if (!res.ok) {
    throw new Error(`Failed to build approval: ${res.statusText}`)
  }

  return res.json()
}
```

---

## Phase 6: UI Components

### Create: `/packages/nextjs/components/QuickSelectButtons.tsx`

```typescript
'use client'

interface QuickSelectButtonsProps {
  balance: string
  decimals: number
  onAmountSelect: (amount: string) => void
  disabled?: boolean
}

export function QuickSelectButtons({
  balance,
  decimals,
  onAmountSelect,
  disabled = false,
}: QuickSelectButtonsProps) {
  const percentages = [
    { label: '25%', value: 0.25 },
    { label: '50%', value: 0.5 },
    { label: '75%', value: 0.75 },
    { label: '100%', value: 1.0 },
  ]

  function handleClick(percentage: number) {
    if (disabled || !balance) return

    const amount = parseFloat(balance) * percentage
    const formatted = amount.toFixed(Math.min(decimals, 6))
    onAmountSelect(formatted)
  }

  if (!balance || parseFloat(balance) === 0) {
    return null
  }

  return (
    <div className="quick-select-buttons">
      {percentages.map(({ label, value }) => (
        <button
          key={label}
          className="quick-select-btn"
          onClick={() => handleClick(value)}
          disabled={disabled}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
```

### Create: `/packages/nextjs/components/SlippageControl.tsx`

```typescript
'use client'

import { useState } from 'react'

interface SlippageControlProps {
  value: number
  onChange: (value: number) => void
  pairType?: 'stable' | 'standard' | 'volatile'
}

export function SlippageControl({
  value,
  onChange,
  pairType = 'standard',
}: SlippageControlProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [customValue, setCustomValue] = useState(value.toString())

  const presets = [0.1, 0.5, 1.0, 3.0]

  function handlePresetClick(preset: number) {
    onChange(preset)
    setCustomValue(preset.toString())
  }

  function handleCustomChange(input: string) {
    setCustomValue(input)
    const parsed = parseFloat(input)
    if (!isNaN(parsed) && parsed >= 0.1 && parsed <= 50) {
      onChange(parsed)
    }
  }

  const isHighSlippage = value > 1.0

  return (
    <div className="create-section">
      <div className="section-header">
        <h3 className="section-title">Slippage Tolerance</h3>
        <button
          className="settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
        >
          {value}% {showSettings ? '▲' : '▼'}
        </button>
      </div>

      {showSettings && (
        <div className="slippage-settings">
          <div className="slippage-presets">
            {presets.map((preset) => (
              <button
                key={preset}
                className={`slippage-btn ${value === preset ? 'selected' : ''}`}
                onClick={() => handlePresetClick(preset)}
              >
                {preset}%
              </button>
            ))}
          </div>

          <div className="slippage-custom">
            <input
              type="number"
              min="0.1"
              max="50"
              step="0.1"
              value={customValue}
              onChange={(e) => handleCustomChange(e.target.value)}
              className="slippage-input"
              placeholder="Custom"
            />
            <span>%</span>
          </div>

          {isHighSlippage && (
            <div className="slippage-warning">
              ⚠️ High slippage tolerance may result in unfavorable trade
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

---

## Phase 7: Update Create Pool Page

### Modify: `/packages/nextjs/app/create-pool/page.tsx`

**Step 7.1: Add Imports**

```typescript
// Add to imports at top
import {
  fetchTokenBalance,
  fetchPoolPrice,
  calculateLiquidityRatio,
} from '@/services/api'
import { QuickSelectButtons } from '@/components/QuickSelectButtons'
import { SlippageControl } from '@/components/SlippageControl'
```

**Step 7.2: Add State Variables**

```typescript
// Add after existing state (around line 76)
const [balanceA, setBalanceA] = useState<string>('')
const [balanceB, setBalanceB] = useState<string>('')
const [loadingBalanceA, setLoadingBalanceA] = useState(false)
const [loadingBalanceB, setLoadingBalanceB] = useState(false)
const [currentPrice, setCurrentPrice] = useState<number | null>(null)
const [priceDisplay, setPriceDisplay] = useState<string>('')
const [slippageTolerance, setSlippageTolerance] = useState(0.5)
const [autoCalculating, setAutoCalculating] = useState(false)
```

**Step 7.3: Add Balance Fetching Effects**

```typescript
// Add after loadWallet function (around line 89)

// Fetch balance for token A
useEffect(() => {
  if (!wallet || !tokenA?.address) {
    setBalanceA('')
    return
  }

  setLoadingBalanceA(true)
  fetchTokenBalance(tokenA.address, wallet)
    .then(({ balanceFormatted }) => {
      setBalanceA(balanceFormatted)
    })
    .catch(err => {
      console.error('[CreatePool] Failed to fetch balance A:', err)
    })
    .finally(() => {
      setLoadingBalanceA(false)
    })
}, [wallet, tokenA?.address])

// Fetch balance for token B
useEffect(() => {
  if (!wallet || !tokenB?.address) {
    setBalanceB('')
    return
  }

  setLoadingBalanceB(true)
  fetchTokenBalance(tokenB.address, wallet)
    .then(({ balanceFormatted }) => {
      setBalanceB(balanceFormatted)
    })
    .catch(err => {
      console.error('[CreatePool] Failed to fetch balance B:', err)
    })
    .finally(() => {
      setLoadingBalanceB(false)
    })
}, [wallet, tokenB?.address])
```

**Step 7.4: Add Price Fetching Effect**

```typescript
// Fetch pool price when tokens or fee tier changes
useEffect(() => {
  if (!tokenA?.address || !tokenB?.address) {
    setCurrentPrice(null)
    setPriceDisplay('')
    return
  }

  fetchPoolPrice({
    version,
    token0: tokenA.address,
    token1: tokenB.address,
    fee: version !== 'v2' ? feeTier : undefined,
  })
    .then(({ exists, price, priceDisplay }) => {
      if (exists && price) {
        setCurrentPrice(price)
        setPriceDisplay(priceDisplay || '')
      } else {
        setCurrentPrice(null)
        setPriceDisplay('')
      }
    })
    .catch(err => {
      console.error('[CreatePool] Failed to fetch pool price:', err)
    })
}, [tokenA?.address, tokenB?.address, version, feeTier])
```

**Step 7.5: Add Auto-Calculation Effects**

```typescript
// Auto-calculate amount B when amount A changes
useEffect(() => {
  if (!amountA || !tokenA || !tokenB || parseFloat(amountA) === 0 || autoCalculating) {
    return
  }

  // If pool doesn't exist yet, user sets both amounts manually
  if (!currentPrice) {
    return
  }

  setAutoCalculating(true)
  calculateLiquidityRatio({
    version,
    token0: tokenA.address,
    token1: tokenB.address,
    fee: version !== 'v2' ? feeTier : undefined,
    amount0: amountA,
    decimals0: tokenA.decimals,
    decimals1: tokenB.decimals,
  })
    .then(({ amount1 }) => {
      setAmountB(amount1)
    })
    .catch(err => {
      console.error('[CreatePool] Failed to calculate amount B:', err)
    })
    .finally(() => {
      setAutoCalculating(false)
    })
}, [amountA, tokenA, tokenB, version, feeTier, currentPrice])

// Auto-calculate amount A when amount B changes
useEffect(() => {
  if (!amountB || !tokenA || !tokenB || parseFloat(amountB) === 0 || autoCalculating) {
    return
  }

  if (!currentPrice) {
    return
  }

  setAutoCalculating(true)
  calculateLiquidityRatio({
    version,
    token0: tokenA.address,
    token1: tokenB.address,
    fee: version !== 'v2' ? feeTier : undefined,
    amount1: amountB,
    decimals0: tokenA.decimals,
    decimals1: tokenB.decimals,
  })
    .then(({ amount0 }) => {
      setAmountA(amount0)
    })
    .catch(err => {
      console.error('[CreatePool] Failed to calculate amount A:', err)
    })
    .finally(() => {
      setAutoCalculating(false)
    })
}, [amountB, tokenA, tokenB, version, feeTier, currentPrice])
```

**Step 7.6: Update Approval Logic**

```typescript
// FIND lines 260-294 and UPDATE approval section:

if (approvalStatus.token0NeedsApproval) {
  const approval = await buildApprovalTransaction(
    tokenA.address,
    spender,
    amount0Wei, // Exact amount
    false       // Not unlimited
  )

  approvalTxs.push({
    ...approval,
    tokenSymbol: tokenA.symbol,
  })

  console.log(`[CreatePool] Will approve exactly ${amountA} ${tokenA.symbol}`)
}

if (approvalStatus.token1NeedsApproval) {
  const approval = await buildApprovalTransaction(
    tokenB.address,
    spender,
    amount1Wei, // Exact amount
    false       // Not unlimited
  )

  approvalTxs.push({
    ...approval,
    tokenSymbol: tokenB.symbol,
  })

  console.log(`[CreatePool] Will approve exactly ${amountB} ${tokenB.symbol}`)
}
```

**Step 7.7: Update Slippage Usage**

```typescript
// FIND line 308 and UPDATE:

slippageTolerance: slippageTolerance, // Use user-configured value
```

**Step 7.8: Update UI - Balance Display**

```typescript
// FIND line 551 and REPLACE with:

<div className="input-label">
  <span>{tokenA.symbol} Amount</span>
  <span className="input-balance">
    Balance: {loadingBalanceA ? (
      <span className="spinner-small"></span>
    ) : balanceA ? (
      <>
        {parseFloat(balanceA).toFixed(6)} {tokenA.symbol}
        {parseFloat(balanceA) < parseFloat(amountA || '0') && (
          <span className="text-error"> (Insufficient)</span>
        )}
      </>
    ) : (
      '--'
    )}
  </span>
</div>

// IMMEDIATELY AFTER, ADD QuickSelectButtons:

{balanceA && tokenA && (
  <QuickSelectButtons
    balance={balanceA}
    decimals={tokenA.decimals}
    onAmountSelect={setAmountA}
    disabled={isCreating}
  />
)}
```

**Step 7.9: Repeat for Token B** (around line 569)

**Step 7.10: Add Slippage Control** (before "Initial Liquidity" section)

```typescript
// ADD before line 541:

<SlippageControl
  value={slippageTolerance}
  onChange={setSlippageTolerance}
  pairType="standard"
/>
```

---

## Phase 8: Styling

### Modify: `/packages/nextjs/styles/globals.css`

**Add to end of file**:

```css
/* Balance Display */
.input-balance {
  font-size: 0.875rem;
  color: #888;
}

.spinner-small {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid #333;
  border-top-color: #0066ff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.text-error {
  color: #ff4444;
  font-weight: 600;
}

/* Quick Select Buttons */
.quick-select-buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.quick-select-btn {
  flex: 1;
  padding: 0.5rem;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-select-btn:hover:not(:disabled) {
  background: #2a2a2a;
  border-color: #0066ff;
}

.quick-select-btn:active:not(:disabled) {
  background: #0066ff;
  transform: scale(0.98);
}

.quick-select-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Slippage Settings */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.settings-toggle {
  padding: 0.5rem 1rem;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-toggle:hover {
  background: #2a2a2a;
  border-color: #0066ff;
}

.slippage-settings {
  margin-top: 1rem;
  padding: 1rem;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
}

.slippage-presets {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.slippage-btn {
  flex: 1;
  padding: 0.75rem;
  background: #0a0a0a;
  border: 1px solid #333;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.slippage-btn:hover {
  background: #2a2a2a;
}

.slippage-btn.selected {
  background: #0066ff;
  color: white;
  border-color: #0066ff;
}

.slippage-custom {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.slippage-input {
  flex: 1;
  padding: 0.75rem;
  background: #0a0a0a;
  border: 1px solid #333;
  border-radius: 8px;
  font-size: 1rem;
  color: #fff;
}

.slippage-input:focus {
  outline: none;
  border-color: #0066ff;
}

.slippage-warning {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: rgba(255, 153, 0, 0.1);
  border: 1px solid #ff9900;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #ff9900;
}

/* Animations */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

---

## Testing Checklist

### Unit Tests
- [ ] Token balance fetching returns correct values
- [ ] Pool price calculation is accurate
- [ ] Ratio calculation handles all decimal combinations
- [ ] Approval amounts are exact (not unlimited)
- [ ] Quick select buttons calculate correct percentages

### Integration Tests
- [ ] Balance updates when wallet changes
- [ ] Auto-calculation triggers when amount A changes
- [ ] Auto-calculation triggers when amount B changes
- [ ] Slippage setting persists and is used in transactions
- [ ] Insufficient balance shows error

### E2E Tests
- [ ] Create pool with WETH/ARBME using 50% balance
- [ ] Create pool with custom tokens
- [ ] Verify exact approval amounts in wallet
- [ ] Test slippage protection (try to create at bad price)
- [ ] Test with very small amounts (0.000001)
- [ ] Test with max amounts

### Edge Cases
- [ ] Token with 6 decimals (USDC-style)
- [ ] Token with 18 decimals (WETH-style)
- [ ] Pool that doesn't exist yet
- [ ] Zero balance
- [ ] Network failure during balance fetch
- [ ] Invalid token address

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Environment variables set (BASE_RPC_URL)
- [ ] Gas estimates verified
- [ ] Mobile responsive checked

### Deployment
- [ ] Deploy to staging
- [ ] Test on Base testnet
- [ ] Test on Base mainnet (small amount)
- [ ] Monitor for errors
- [ ] Deploy to production

### Post-Deployment
- [ ] Monitor error logs
- [ ] Collect user feedback
- [ ] Track conversion rate (pool creations)
- [ ] Measure gas usage
- [ ] Document any issues

---

## Success Metrics

### User Experience
- Reduced time to create pool: 50% faster
- Reduced user errors: 80% fewer insufficient balance attempts
- Increased successful transactions: 90%+ success rate

### Security
- Zero unlimited approvals (unless explicitly requested)
- All approvals are exact amounts
- Slippage protection active on all transactions

### Adoption
- Increased pool creation rate
- Positive user feedback
- Reduced support tickets

---

## Next Steps After Implementation

1. **Analytics Integration**: Track usage of 25/50/75/100% buttons
2. **USD Value Display**: Show USD value alongside token amounts
3. **Gas Estimation**: Display estimated gas costs
4. **Transaction History**: Show recent pool creations
5. **Permit2 Integration**: Upgrade to gasless approvals
6. **Multi-Pool Creation**: Create multiple pools in one transaction

---

**Ready to implement!** Start with Phase 1 and work through sequentially.
