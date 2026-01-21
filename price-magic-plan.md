# Price Magic Implementation Plan

## Current State Analysis

### What We Have
Our application currently supports creating liquidity pools for Uniswap V2, V3, and V4 on Base network. The create pool page (`/app/create-pool/page.tsx`) includes:

1. **Token Selection**: Users can select two tokens from a predefined list
2. **Amount Inputs**: Two input fields for entering token amounts
3. **Balance Display**: Shows user's balance for each selected token
4. **Quick Select Buttons**: 25%, 50%, 75%, 100% buttons for easy balance selection
5. **Auto-calculation Logic**: Attempts to calculate the second token amount when one is entered
6. **Slippage Control**: User-configurable slippage tolerance
7. **Exact Approvals**: Security-conscious exact token approval amounts

### Backend APIs
- `/app/api/token-balance/route.ts` - Fetches ERC20 token balances
- `/app/api/pool-price/route.ts` - Fetches current pool price from existing pools (V2/V3/V4)
- `/app/api/calculate-ratio/route.ts` - Auto-calculates token amounts based on pool price
- `/app/api/build-approval/route.ts` - Builds exact approval transactions

## The Problem

### Critical Issue: Pool Doesn't Exist Yet
Our auto-calculation feature has a fundamental flaw:

```typescript
// Lines 234-261 in create-pool/page.tsx
useEffect(() => {
  const fetchPrice = async () => {
    // ...
    const result = await fetchPoolPrice(version, token0Address, token1Address, fee)

    if (!result.exists || !result.price) {
      // Pool doesn't exist - auto-calculation cannot work!
      setPoolPrice(null)
      return
    }
    // ...
  }
}, [version, token0, token1, fee])
```

**The fundamental problem**: When creating a NEW pool, there is no existing price to fetch. The pool doesn't exist yet, so `fetchPoolPrice()` returns `exists: false`, and our auto-calculation logic fails.

### Current Behavior
1. User selects two tokens for a new pool
2. API checks if pool exists → returns `exists: false`
3. Auto-calculation doesn't work
4. User must manually calculate both amounts
5. **The ratio they choose becomes the initial price, but we don't tell them this**
6. No validation that their ratio makes sense

### Additional Problems
1. **No Initial Price Setting**: Users creating new pools don't explicitly set the starting price
2. **Different Math for V2 vs V3/V4**: V2 uses reserves, V3/V4 use sqrtPriceX96, we treat them the same
3. **No Price Discovery for Unlisted Tokens**: If tokens aren't in our list, no way to get price data
4. **No Ratio Display**: Users don't see what price ratio they're creating
5. **Confusing UX**: Balance magic works for adding to existing pools but silently fails for new pools

## Industry Standard Best Practices

### Uniswap V2 Pool Creation

**How V2 Works:**
- V2 pools use a simple constant product formula: `x * y = k`
- No sqrtPriceX96 encoding
- Initial price is **implicitly set by the ratio of tokens deposited**
- Formula: `price = reserve1 / reserve0`

**Industry Standard (Uniswap V2 Interface):**
1. User enters amount for Token A
2. User enters amount for Token B
3. **The ratio of these amounts becomes the initial pool price**
4. Interface displays: "Initial price: 1 TOKEN0 = X TOKEN1"
5. Warning if price deviates significantly from external market prices (if available)

**Example:**
```
User deposits: 100 USDC + 0.05 ETH
Initial price: 1 ETH = 2000 USDC
```

**Best Practices:**
- Show the implied price ratio clearly
- For known tokens, compare against oracle/market prices and warn if >5% deviation
- For unknown tokens, accept any ratio (user sets market)
- Auto-calculate second amount when first is entered (using user-provided price)

### Uniswap V3 Pool Creation

**How V3 Works:**
- V3 uses concentrated liquidity with tick-based pricing
- Price is encoded as `sqrtPriceX96 = sqrt(price) * 2^96`
- Pool MUST be initialized with explicit sqrtPriceX96 before any liquidity can be added
- Formula to convert: `sqrtPriceX96 = sqrt(token1/token0) * 2^96`

**Industry Standard (Uniswap V3 Interface):**
1. **Explicit Price Input**: User must set starting price before creating pool
2. Interface shows input: "Set starting price" with token pair (e.g., "USDC per ETH")
3. User enters price (e.g., "2000")
4. Interface converts to sqrtPriceX96 internally
5. User then sets price range (min/max tick)
6. When user enters one token amount, second is calculated using the initial price
7. Interface validates that current price is within selected range

**Example Flow:**
```
Step 1: Select Token0 (ETH) and Token1 (USDC)
Step 2: Set initial price: "1 ETH = 2000 USDC"
        Internally calculates: sqrtPriceX96 = sqrt(2000) * 2^96
Step 3: Set price range: Min: 1800 USDC, Max: 2200 USDC
Step 4: Enter amount: 0.5 ETH
        Auto-calculates: 1000 USDC (using initial price)
```

**Best Practices:**
- **Always require explicit initial price input for new V3 pools**
- Show price in human-readable format (not sqrtPriceX96)
- Account for token decimals in price calculation
- Validate that initial price is within user's selected range
- For known token pairs, suggest current market price as default
- Show warning if price differs from market by >5%

**Mathematical Considerations:**
```javascript
// Price accounting for decimals
const price = (amount1 / 10**decimals1) / (amount0 / 10**decimals0)

// Convert to sqrtPriceX96
const sqrtPriceX96 = BigNumber.from(
  Math.floor(Math.sqrt(price) * (2 ** 96))
)

// Initialize pool
pool.initialize(sqrtPriceX96)
```

### Uniswap V4 Pool Creation

**How V4 Works:**
- V4 uses the same sqrtPriceX96 encoding as V3
- Introduces "hooks" for customization, but core pricing math is identical
- Uses PoolKey instead of deployed pool addresses
- Still requires explicit price initialization

**Industry Standard (Uniswap V4 Interface):**
- **Identical to V3 for price setting**
- User sets explicit initial price
- Price converted to sqrtPriceX96
- Auto-calculation uses this price
- PoolKey structure: `{currency0, currency1, fee, tickSpacing, hooks}`

**Best Practices:**
- Same as V3 (explicit price input, validation, market price comparison)
- V4-specific: Validate hooks configuration doesn't interfere with pricing
- Handle dynamic fees if applicable

### Price Discovery for Unlisted Tokens

**The Challenge:**
Users want to create pools with tokens not in our predefined list. We have no price data for these tokens.

**Industry Standard Solutions:**

**Option 1: Manual Price Input (Recommended for MVP)**
```
"What is the current USD price of TOKEN0?"
User enters: $2.50

"What is the current USD price of TOKEN1?"
User enters: $1.00

Calculate ratio: 1 TOKEN0 = 2.5 TOKEN1
Use this for auto-calculation and pool initialization
```

**Option 2: External Price Oracles (Future Enhancement)**
- CoinGecko API
- CoinMarketCap API
- Chainlink Price Feeds
- DEX Aggregators (1inch, 0x)

**Option 3: Let User Set Ratio Directly**
```
"What should the initial price be?"
"1 TOKEN0 = ___ TOKEN1"
User enters: 2.5
```

**Best Practices:**
- For MVP: Ask for USD price of each token separately (more intuitive)
- Calculate ratio from USD prices
- Display the calculated ratio clearly: "Pool will be created with initial price: 1 TOKEN0 = 2.5 TOKEN1"
- Add disclaimer: "You are setting the initial market price for this pair"
- Warn that incorrect pricing may result in immediate arbitrage

### Multi-Version Support Strategy

**Best Practice: Version-Specific Logic**

```typescript
// Pseudocode for handling different versions
if (version === 'v2') {
  // V2: Price is implicit from ratio
  // Just show the ratio, no sqrtPriceX96 needed
  displayInitialPrice(amount0, amount1)

} else if (version === 'v3' || version === 'v4') {
  // V3/V4: Require explicit price input
  const sqrtPriceX96 = calculateSqrtPriceX96(userProvidedPrice)

  // Validate price is within range
  validatePriceInRange(sqrtPriceX96, minTick, maxTick)

  // Use for auto-calculation
  autoCalculateSecondAmount(amount0, userProvidedPrice)
}
```

**Token List Strategy:**
1. **Start Small**: Support 5-10 well-known tokens (WETH, USDC, DAI, etc.)
2. **Known Token Prices**: Fetch from CoinGecko/CMC for validation
3. **Unknown Tokens**: Require manual price input
4. **Clear UX**: "This token is not in our database. Please provide current prices."

## Implementation Action Plan

### Phase 1: API Enhancements

#### 1.1 Update `/app/api/pool-price/route.ts`
**Current**: Returns `exists: false` when pool doesn't exist
**Enhancement**: Add ability to accept user-provided price as fallback

```typescript
export async function POST(request: NextRequest) {
  const { version, token0, token1, fee, userProvidedPrice } = await request.json()

  // Try to fetch existing pool price
  // ... existing code ...

  if (poolAddress === ethers.constants.AddressZero) {
    // Pool doesn't exist
    if (userProvidedPrice) {
      // Use user-provided price for new pool
      return NextResponse.json({
        exists: false,
        price: userProvidedPrice,
        priceDisplay: `1 ${symbol0} = ${userProvidedPrice} ${symbol1}`,
        isUserProvided: true,
        token0Symbol: symbol0,
        token1Symbol: symbol1,
      })
    }

    return NextResponse.json({
      exists: false,
      price: null,
      priceDisplay: null,
      requiresPriceInput: true,
      token0Symbol: symbol0,
      token1Symbol: symbol1,
    })
  }

  // ... existing pool price fetch logic ...
}
```

#### 1.2 Create `/app/api/calculate-sqrt-price/route.ts`
**Purpose**: Convert human-readable price to sqrtPriceX96 for V3/V4

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

export async function POST(request: NextRequest) {
  try {
    const { price, decimals0, decimals1 } = await request.json()

    // Adjust price for decimals
    // price is in terms of token1 per token0
    const adjustedPrice = price * (10 ** decimals0) / (10 ** decimals1)

    // Calculate sqrtPriceX96 = sqrt(price) * 2^96
    const sqrtPrice = Math.sqrt(adjustedPrice)
    const Q96 = ethers.BigNumber.from(2).pow(96)
    const sqrtPriceX96 = ethers.BigNumber.from(
      Math.floor(sqrtPrice * Number(Q96.toString()))
    )

    return NextResponse.json({
      sqrtPriceX96: sqrtPriceX96.toString(),
      price: adjustedPrice,
      priceDisplay: `1 TOKEN0 = ${price} TOKEN1`,
    })
  } catch (error: any) {
    console.error('[calculate-sqrt-price] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to calculate sqrtPriceX96' },
      { status: 500 }
    )
  }
}
```

#### 1.3 Create `/app/api/token-price/route.ts` (Optional - Future)
**Purpose**: Fetch market prices from CoinGecko/CMC for known tokens

```typescript
// For future implementation
// Fetches USD price for known tokens to validate user inputs
```

### Phase 2: Frontend Components

#### 2.1 Create `InitialPriceInput.tsx`
**Purpose**: Component for setting initial pool price

```typescript
interface InitialPriceInputProps {
  token0Symbol: string
  token1Symbol: string
  onPriceSet: (price: number) => void
  marketPrice?: number // Optional: for validation
  disabled?: boolean
}

// Features:
// - Input field: "1 {token0Symbol} = ___ {token1Symbol}"
// - If marketPrice provided, show comparison
// - Warning if user price differs from market by >5%
// - Clear visual feedback
// - Option to flip the ratio (quote in opposite direction)
```

#### 2.2 Create `TokenPriceInput.tsx`
**Purpose**: Component for getting USD price of unlisted tokens

```typescript
interface TokenPriceInputProps {
  tokenSymbol: string
  tokenAddress: string
  onPriceSet: (usdPrice: number) => void
}

// Features:
// - Input: "What is the current USD price of {tokenSymbol}?"
// - Placeholder: "$0.00"
// - Validation: Must be > 0
// - Help text: "This will be used to calculate the pool ratio"
```

#### 2.3 Create `InitialPriceDisplay.tsx`
**Purpose**: Shows the implied initial price to user

```typescript
interface InitialPriceDisplayProps {
  token0Symbol: string
  token1Symbol: string
  amount0: string
  amount1: string
  version: 'v2' | 'v3' | 'v4'
}

// Features:
// - Calculates and displays: "Initial price: 1 {token0} = X {token1}"
// - Flip button to show inverse
// - Warning badge if creating new pool
// - Different styling for V2 vs V3/V4
```

### Phase 3: Update Create Pool Page

#### 3.1 Add State Management
**File**: `/app/create-pool/page.tsx`

```typescript
// Add new state
const [poolExists, setPoolExists] = useState<boolean | null>(null)
const [requiresPriceInput, setRequiresPriceInput] = useState(false)
const [userProvidedPrice, setUserProvidedPrice] = useState<number | null>(null)
const [token0UsdPrice, setToken0UsdPrice] = useState<number | null>(null)
const [token1UsdPrice, setToken1UsdPrice] = useState<number | null>(null)
const [calculatedSqrtPriceX96, setCalculatedSqrtPriceX96] = useState<string | null>(null)
```

#### 3.2 Update Pool Existence Check Logic

```typescript
useEffect(() => {
  const checkPool = async () => {
    if (!token0 || !token1) return

    setIsLoadingPrice(true)
    try {
      const result = await fetchPoolPrice(version, token0Address, token1Address, fee)

      setPoolExists(result.exists)

      if (result.exists) {
        // Existing pool - use fetched price
        setPoolPrice(result.price)
        setRequiresPriceInput(false)
      } else {
        // New pool - need user to provide price
        setPoolPrice(null)
        setRequiresPriceInput(true)
      }
    } catch (error) {
      console.error('Error checking pool:', error)
    } finally {
      setIsLoadingPrice(false)
    }
  }

  checkPool()
}, [version, token0, token1, fee])
```

#### 3.3 Add Price Input UI Logic

```typescript
// Version-specific price input rendering
const renderPriceInput = () => {
  if (poolExists === null) return null // Still loading

  if (poolExists) {
    // Pool exists - show current price, no input needed
    return (
      <div className="pool-price-display">
        <label>Current Pool Price</label>
        <div>{poolPrice ? `1 ${token0Symbol} = ${poolPrice.toFixed(6)} ${token1Symbol}` : 'Loading...'}</div>
      </div>
    )
  }

  // Pool doesn't exist - need price input
  if (version === 'v2') {
    // V2: Show implied price from amounts, or ask for USD prices
    if (token0IsKnown && token1IsKnown) {
      // Use market prices for auto-calculation
      return <div className="info">Enter amounts to set initial price</div>
    } else {
      // Ask for USD prices of unknown tokens
      return (
        <>
          <TokenPriceInput
            tokenSymbol={token0Symbol}
            tokenAddress={token0Address}
            onPriceSet={setToken0UsdPrice}
          />
          <TokenPriceInput
            tokenSymbol={token1Symbol}
            tokenAddress={token1Address}
            onPriceSet={setToken1UsdPrice}
          />
        </>
      )
    }
  } else {
    // V3/V4: Always need explicit initial price
    return (
      <InitialPriceInput
        token0Symbol={token0Symbol}
        token1Symbol={token1Symbol}
        onPriceSet={setUserProvidedPrice}
        marketPrice={marketPrice} // If we have it
      />
    )
  }
}
```

#### 3.4 Update Auto-Calculation Logic

```typescript
useEffect(() => {
  const calculateSecondAmount = async () => {
    if (!amount0 || !token0 || !token1) return

    let priceToUse: number | null = null

    if (poolExists && poolPrice) {
      // Use existing pool price
      priceToUse = poolPrice
    } else if (!poolExists) {
      // New pool - use user-provided price
      if (version === 'v2') {
        // Calculate from USD prices
        if (token0UsdPrice && token1UsdPrice) {
          priceToUse = token1UsdPrice / token0UsdPrice
        }
      } else {
        // V3/V4 - use explicit user price
        priceToUse = userProvidedPrice
      }
    }

    if (!priceToUse) return

    // Calculate amount1 = amount0 * price
    const calculatedAmount1 = (parseFloat(amount0) * priceToUse).toFixed(
      Math.min(token1.decimals, 6)
    )

    setAmount1(calculatedAmount1)
  }

  calculateSecondAmount()
}, [amount0, poolExists, poolPrice, userProvidedPrice, token0UsdPrice, token1UsdPrice])
```

#### 3.5 Update Pool Creation Transaction

```typescript
const handleCreatePool = async () => {
  try {
    // ... existing validation ...

    let initializationParams

    if (version === 'v2') {
      // V2: Just deposit amounts, ratio becomes price
      initializationParams = {
        token0: token0Address,
        token1: token1Address,
        amount0: ethers.utils.parseUnits(amount0, token0.decimals),
        amount1: ethers.utils.parseUnits(amount1, token1.decimals),
      }
    } else if (version === 'v3' || version === 'v4') {
      // V3/V4: Must initialize with sqrtPriceX96 first
      if (!userProvidedPrice) {
        throw new Error('Please set the initial price')
      }

      // Calculate sqrtPriceX96
      const sqrtPriceResult = await fetch('/api/calculate-sqrt-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: userProvidedPrice,
          decimals0: token0.decimals,
          decimals1: token1.decimals,
        }),
      }).then(res => res.json())

      initializationParams = {
        token0: token0Address,
        token1: token1Address,
        fee: fee,
        sqrtPriceX96: sqrtPriceResult.sqrtPriceX96,
        amount0: ethers.utils.parseUnits(amount0, token0.decimals),
        amount1: ethers.utils.parseUnits(amount1, token1.decimals),
      }
    }

    // ... proceed with transaction ...
  } catch (error) {
    console.error('Error creating pool:', error)
  }
}
```

### Phase 4: Token List Management

#### 4.1 Create Token Registry
**File**: `/constants/knownTokens.ts`

```typescript
export interface KnownToken {
  symbol: string
  address: string
  decimals: number
  coingeckoId?: string // For price fetching
  chainId: number
}

export const KNOWN_TOKENS_BASE: KnownToken[] = [
  {
    symbol: 'WETH',
    address: '0x4200000000000000000000000000000000000006',
    decimals: 18,
    coingeckoId: 'weth',
    chainId: 8453,
  },
  {
    symbol: 'USDC',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    coingeckoId: 'usd-coin',
    chainId: 8453,
  },
  // Add more as needed
]

export function isKnownToken(address: string, chainId: number): boolean {
  return KNOWN_TOKENS_BASE.some(
    token => token.address.toLowerCase() === address.toLowerCase() && token.chainId === chainId
  )
}

export function getKnownToken(address: string, chainId: number): KnownToken | null {
  return KNOWN_TOKENS_BASE.find(
    token => token.address.toLowerCase() === address.toLowerCase() && token.chainId === chainId
  ) || null
}
```

#### 4.2 Integration
```typescript
// In create-pool page
const token0IsKnown = isKnownToken(token0Address, 8453)
const token1IsKnown = isKnownToken(token1Address, 8453)
```

### Phase 5: UX Enhancements

#### 5.1 Add Warning Banners

```typescript
// For new pool creation
{!poolExists && (
  <div className="warning-banner">
    <strong>Creating New Pool</strong>
    <p>You are creating a new liquidity pool. The price ratio you set will become the initial market price.</p>
  </div>
)}

// For price deviation
{priceDeviationPercent > 5 && (
  <div className="warning-banner">
    <strong>Price Warning</strong>
    <p>Your price differs from market by {priceDeviationPercent.toFixed(1)}%. This may result in immediate arbitrage.</p>
  </div>
)}
```

#### 5.2 Add Loading States

```typescript
{isLoadingPrice && (
  <div className="loading-price">
    <span className="spinner" />
    Checking if pool exists...
  </div>
)}
```

#### 5.3 Add Help Text

```typescript
<div className="help-text">
  {version === 'v2' && 'The ratio of tokens you deposit will set the initial price'}
  {version === 'v3' && 'Set the starting price for your concentrated liquidity position'}
  {version === 'v4' && 'Set the starting price for your V4 pool'}
</div>
```

### Phase 6: Testing Checklist

#### 6.1 V2 Pool Creation
- [ ] Create new V2 pool with known tokens (e.g., WETH/USDC)
- [ ] Verify USD prices are fetched correctly
- [ ] Test auto-calculation of second amount
- [ ] Verify implied price ratio is displayed
- [ ] Confirm pool initializes with correct reserves
- [ ] Create V2 pool with unknown token
- [ ] Test manual USD price input
- [ ] Verify ratio calculation from USD prices

#### 6.2 V3 Pool Creation
- [ ] Create new V3 pool with explicit price input
- [ ] Verify sqrtPriceX96 calculation is correct
- [ ] Test auto-calculation using user-provided price
- [ ] Confirm pool initializes with correct sqrtPriceX96
- [ ] Test price range validation
- [ ] Verify warning shows if price outside range
- [ ] Test with various decimal combinations (18/18, 18/6, 6/6)

#### 6.3 V4 Pool Creation
- [ ] Same tests as V3
- [ ] Verify PoolKey structure is correct
- [ ] Test with hooks if applicable

#### 6.4 Existing Pool (Add Liquidity)
- [ ] Verify auto-calculation still works for existing pools
- [ ] Confirm no price input shown for existing pools
- [ ] Test quick select buttons work correctly
- [ ] Verify balance magic features intact

#### 6.5 Edge Cases
- [ ] Test with tokens that have 0 decimals
- [ ] Test with very large token amounts
- [ ] Test with very small token amounts (dust)
- [ ] Test rapid token switching
- [ ] Test network errors during price fetch
- [ ] Test invalid price inputs (negative, zero, NaN)

### Phase 7: Documentation

#### 7.1 User-Facing Documentation
- Create tooltip explaining initial price
- Add help modal: "How to create a pool"
- Document supported tokens
- Explain price discovery for unknown tokens

#### 7.2 Code Documentation
- Document price calculation formulas
- Add comments explaining V2 vs V3/V4 differences
- Document sqrtPriceX96 conversion logic
- Add JSDoc to all new functions

### Phase 8: Future Enhancements

#### 8.1 Price Oracle Integration
- Integrate CoinGecko API for known token prices
- Add Chainlink price feed support
- DEX aggregator price comparison

#### 8.2 Advanced Features
- Multi-hop price discovery (e.g., TOKEN/ETH * ETH/USD)
- Historical price charts
- Liquidity depth visualization
- Impermanent loss calculator
- APR/APY estimates

#### 8.3 Token List Expansion
- Allow community token submissions
- Automated token verification
- Token metadata (logo, description, website)
- Trust scoring system

## Success Criteria

### Must Have (MVP)
1. ✅ V2 pools can be created with correct initial price ratio
2. ✅ V3/V4 pools require explicit initial price input
3. ✅ Auto-calculation works for both new and existing pools
4. ✅ Unknown tokens can be used with manual USD price input
5. ✅ Initial price is clearly displayed to user
6. ✅ Warning shown when creating new pools
7. ✅ All three versions (V2, V3, V4) work correctly

### Nice to Have (V1.1)
1. Market price comparison for known tokens
2. Price deviation warnings
3. Token price caching
4. Price flip button (show inverse ratio)

### Future (V2.0)
1. Oracle integration
2. Expanded token list
3. Advanced analytics
4. Multi-chain support

## Timeline Estimate

**Phase 1-3**: Core implementation (API + Components + Page Updates)
**Phase 4**: Token registry setup
**Phase 5**: UX polish
**Phase 6**: Testing
**Phase 7-8**: Documentation and future work

## Risk Mitigation

### Risk 1: Incorrect sqrtPriceX96 Calculation
**Mitigation**:
- Use well-tested libraries (@uniswap/v3-sdk)
- Add extensive unit tests
- Compare against Uniswap interface calculations

### Risk 2: Decimal Precision Loss
**Mitigation**:
- Use BigNumber for all calculations
- Test with various decimal combinations
- Add overflow/underflow checks

### Risk 3: User Sets Wrong Initial Price
**Mitigation**:
- Clear warnings and confirmations
- Market price comparison where possible
- "Are you sure?" modal before creation
- Educational tooltips

### Risk 4: Token Approval Security
**Mitigation**:
- Continue using exact approvals (already implemented)
- Clear display of approval amounts
- Revoke approval functionality

## Conclusion

This plan addresses the fundamental issue with our pool creation flow: the inability to set initial prices for new pools. By implementing version-specific logic and price discovery mechanisms, we'll provide a professional, intuitive experience that matches industry standards while maintaining our security-first approach with exact approvals.

The phased approach allows us to start with a small, well-supported token list and expand over time. Manual price input for unknown tokens is acceptable for MVP and actually provides more control to advanced users creating truly novel pairs.
