# Balance Magic - Analysis & Implementation Plan

## Table of Contents
1. [Current State Analysis](#current-state-analysis)
2. [Industry Best Practices](#industry-best-practices)
3. [Implementation Plan](#implementation-plan)

---

## Current State Analysis

### Overview
Analyzed the ArbMe codebase on 2026-01-21 to understand current liquidity provision functionality and identify gaps in user experience for balance management, token approvals, and LP position creation.

### Architecture
- **Frontend**: Next.js application in `/packages/nextjs`
- **API Layer**: Service functions in `/packages/nextjs/services/api.ts`
- **Wallet Integration**: Farcaster SDK for wallet connection

### Current Implementation - Create Pool Page
**File**: `/packages/nextjs/app/create-pool/page.tsx`

#### What Works ✅
1. **Token Selection**:
   - Common tokens pre-loaded (ARBME, WETH, CLANKER, etc.)
   - Custom token address input supported
   - Automatic token info fetching (symbol, decimals)

2. **Pool Configuration**:
   - Multiple Uniswap versions supported (V2, V3, V4)
   - Fee tier selection for V3/V4
   - Pool existence checking

3. **Token Approvals**:
   - Approval status checking via `checkApprovals()`
   - Automatic approval transactions before pool creation
   - Sequential approval handling for both tokens

4. **Slippage Protection**:
   - Hard-coded 0.5% slippage tolerance (line 308)

#### Critical Gaps ❌

1. **No Balance Display**:
   ```tsx
   // Lines 551, 569 - Hardcoded placeholder
   <span className="input-balance">Balance: --</span>
   ```
   - Users cannot see their token balances
   - No way to know if they have sufficient funds

2. **No Quick Select Buttons**:
   - Missing 25%, 50%, 75%, 100% buttons
   - Users must manually type amounts
   - No "Max" button for convenience

3. **No Auto-Calculation Between Tokens**:
   - When user enters `amountA`, `amountB` is not automatically calculated
   - Users must manually calculate the correct ratio
   - Risk of creating pools at incorrect prices

4. **Unlimited Token Approvals**:
   ```tsx
   // Line 265 - Uses buildApprovalTransaction without amount parameter
   await buildApprovalTransaction(tokenA.address, spender)
   ```
   - Current implementation appears to request unlimited approvals
   - Security risk if contracts are compromised
   - No indication to user of approval amount

5. **Fixed Slippage Tolerance**:
   ```tsx
   // Line 308 - Hard-coded value
   slippageTolerance: 0.5,
   ```
   - No user control over slippage
   - 0.5% may be too high for stable pairs
   - May be too low for volatile pairs

6. **No Decimals Handling**:
   ```tsx
   // Lines 240-243 - Assumes correct decimals
   const amount0Wei = (parseFloat(amountA) * 10 ** decimals0).toString()
   ```
   - Decimals are fetched but conversion is simplistic
   - No validation of input precision
   - Risk of rounding errors

### Current Implementation - Add Liquidity to Position
**File**: `/packages/nextjs/app/position/[id]/page.tsx`

#### What Works ✅
1. **Position Management**:
   - View existing positions
   - Add liquidity to positions
   - Remove liquidity (with percentage slider)
   - Fee collection

2. **Remove Liquidity UX**:
   - Percentage slider (1-100%)
   - Preview of amounts to receive
   - Good UX pattern (lines 470-523)

#### Critical Gaps ❌

1. **No Balance Display** (lines 426-445):
   - Same issue as create pool page
   - Users don't know available balances

2. **No Quick Select Buttons**:
   - Add liquidity form lacks 25/50/75/100% buttons
   - Inconsistent UX vs remove liquidity (which has good slider UX)

3. **No Ratio Calculation**:
   - Users must manually calculate proper ratio
   - Risk of providing imbalanced liquidity

4. **Hard-coded Decimals**:
   ```tsx
   // Lines 114-117 - TODO comment indicates this is a known issue
   const decimals0 = position.token0.amount ? 18 : 18 // TODO: get actual decimals
   const decimals1 = position.token1.amount ? 18 : 18
   ```

### API Implementation Analysis
**File**: `/packages/nextjs/services/api.ts`

#### Available Functions
1. `fetchTokenInfo(address)` - Gets symbol, name, decimals
2. `checkApprovals()` - Checks if approvals are sufficient
3. `buildApprovalTransaction()` - Creates approval transaction
4. `buildIncreaseLiquidityTransaction()` - Adds liquidity to position
5. `buildCreatePoolTransaction()` - Creates pool + adds initial liquidity

#### Missing Functions
1. **No balance fetching function**
   - Need: `fetchTokenBalance(tokenAddress, walletAddress)`
   - Should return balance in wei and formatted

2. **No ratio calculation function**
   - Need: `calculateLiquidityRatio(poolAddress, amount0OrAmount1)`
   - Should calculate required amount for other token

3. **No exact approval amount support**
   - `buildApprovalTransaction()` doesn't accept amount parameter
   - Needs to support both unlimited and exact approvals

### Summary of Current State

#### Strengths
- Solid foundation with token selection and pool configuration
- Multi-version Uniswap support (V2, V3, V4)
- Approval checking and sequential transaction handling
- Good remove liquidity UX pattern (percentage slider)

#### Critical Deficiencies
1. **User Visibility**: No balance display anywhere
2. **User Convenience**: No quick select buttons (25/50/75/100%)
3. **Correctness**: No auto-calculation of token ratios
4. **Security**: Unlimited approvals instead of exact amounts
5. **Flexibility**: Fixed slippage tolerance
6. **Consistency**: Missing actual decimals handling

---

## Industry Best Practices

### 1. Token Balance Display & Management

#### ERC20 Balance Fetching
**Sources**: [QuickNode Guide](https://www.quicknode.com/guides/ethereum-development/smart-contracts/how-to-get-the-balance-of-an-erc-20-token), [MetaMask/Infura Documentation](https://support.metamask.io/develop/building-with-infura/javascript-typescript/how-to-retrieve-balance-erc20-web3js)

**Best Practice**: Use the ERC20 `balanceOf()` method via Web3 provider

**Implementation Pattern**:
```javascript
// Minimal ABI required
const minABI = [{
  "constant": true,
  "inputs": [{"name": "_owner", "type": "address"}],
  "name": "balanceOf",
  "outputs": [{"name": "balance", "type": "uint256"}],
  "type": "function"
}];

// Fetch balance
const contract = new web3.eth.Contract(minABI, tokenAddress);
const balanceWei = await contract.methods.balanceOf(walletAddress).call();
const balanceFormatted = web3.utils.fromWei(balanceWei, 'ether');
```

**Key Considerations**:
- Balance is returned in wei (smallest unit)
- Must account for token decimals (not all tokens use 18 decimals)
- Should cache balances and refresh on transactions
- Display both formatted balance and USD value when possible

### 2. Percentage Selector Buttons (25/50/75/100%)

#### DeFi UI Pattern Analysis
**Sources**: [THORSwap](https://thorswap.me/), [DeFi Design Tips](https://medium.com/@JonCrabb/defi-design-tips-volume-one-6507512f9c98), [Baymard Institute](https://baymard.com/blog/use-buttons-for-size-selection)

**Best Practice**: Provide quick selection buttons alongside manual input

**Pattern Elements**:
1. **Button Layout**: Horizontal row of 4 buttons (25%, 50%, 75%, 100%)
2. **"Max" Button**: Alternative to 100%, accounts for gas requirements
3. **Visual Feedback**: Selected button highlighted, updates input field
4. **Maintains Text Input**: Buttons supplement, don't replace manual entry

**UX Benefits**:
- Reduces cognitive load for common operations
- Prevents typos in manual entry
- Faster transaction execution
- Industry-standard pattern (user familiarity)

**Implementation Considerations**:
- For native currency (ETH), "Max" should reserve gas (~0.01 ETH)
- For ERC20 tokens, "Max" can use full balance
- Buttons should update the input field, not bypass it
- Allow manual override after clicking button

### 3. Uniswap V3/V4 Liquidity Math

#### Price and Ratio Calculation
**Sources**: [Uniswap V3 Math Primer](https://blog.uniswap.org/uniswap-v3-math-primer), [Liquidity Math Technical Note](https://atiselsts.github.io/pdfs/uniswap-v3-liquidity-math.pdf), [V3 Deep Dive](https://medium.com/@jaysojitra1011/uniswap-v3-deep-dive-visualizing-ticks-and-liquidity-provisioning-part-3-081db166243b)

**Core Concepts**:

1. **Square Root Price Encoding**:
   - Uniswap V3/V4 stores √P, not P
   - Simplifies mathematical operations
   - Variable name: `sqrtPriceX96` (encoded with 96-bit precision)

2. **Liquidity Position Ratio**:
   - Current price determines token ratio
   - Liquidity below current price → Token0 only
   - Liquidity above current price → Token1 only
   - Liquidity at current price → Both tokens in ratio

3. **Auto-Calculation Formula**:
   ```
   If user provides amount0:
     amount1 = amount0 * currentPrice

   If user provides amount1:
     amount0 = amount1 / currentPrice
   ```

4. **Concentrated Liquidity**:
   - V3/V4 positions have price ranges (tickLower, tickUpper)
   - Ratio depends on current price relative to range
   - More complex calculation than V2

**Implementation Pattern**:
```javascript
// Get current pool state
const pool = await getPool(token0, token1, fee);
const sqrtPriceX96 = pool.sqrtPriceX96;

// Calculate price
const price = (sqrtPriceX96 / (2 ** 96)) ** 2;

// Auto-calculate amounts
function calculateAmount1(amount0, price) {
  return amount0 * price;
}

function calculateAmount0(amount1, price) {
  return amount1 / price;
}
```

### 4. Slippage Protection

#### Current Standards
**Sources**: [Uniswap V3 Development Book](https://uniswapv3book.com/milestone_3/slippage-protection.html), [Uniswap SDK Guide](https://docs.uniswap.org/sdk/v3/guides/liquidity/modifying-position), [Increase Liquidity Guide](https://docs.uniswap.org/contracts/v3/guides/providing-liquidity/increase-liquidity)

**Best Practice**: User-configurable slippage with sensible defaults

**Recommended Defaults**:
- **Stable pairs**: 0.1% - 0.5%
- **Standard pairs**: 0.5% - 1.0%
- **Volatile pairs**: 1.0% - 3.0%

**Implementation Pattern**:
```javascript
// SDK pattern
const slippageTolerance = new Percent(50, 10_000); // 0.5%

// For liquidity addition
const { amount0Min, amount1Min } = calculateMinAmounts(
  amount0Desired,
  amount1Desired,
  slippageTolerance
);
```

**Key Points**:
- Default to 0.5% for standard pairs
- Allow user to customize (0.1% - 5% range)
- Show warning for slippage > 1%
- Calculate minimum amounts using slippage tolerance
- V4 uses flash accounting, validating principal amount excluding fees

**Front-Running Protection**:
- Proper slippage parameters are critical
- Functions exposed to front-running risk
- Could mint/add liquidity at distorted price without protection

### 5. Token Approvals

#### Exact vs Unlimited Approvals
**Sources**: [Unlimited Approvals Considered Harmful](https://kalis.me/unlimited-erc20-allowances/), [BlockSec Analysis](https://blocksecteam.medium.com/unlimited-approval-in-erc20-convenience-or-security-1c8dce421ed7), [Smart Contract Tips](https://smartcontract.tips/en/post/understanding-erc20-token-approvals), [Speedrun Ethereum](https://speedrunethereum.com/guides/erc20-approve-pattern)

**Security Analysis**:

**Exact Amount Approvals** ✅ (Recommended):
- **Security**: Safest practice - limits exposure
- **Pattern**: Approve only the exact amount needed for current transaction
- **Trade-off**: Requires approval for each transaction
- **User Trust**: Transparent, users see exact amount
- **Best For**: Security-conscious users, high-value transactions

**Unlimited Approvals** ⚠️ (Convenient but Risky):
- **Security**: Dangerous if contract is compromised
- **Pattern**: Approve `type(uint256).max` or token total supply
- **Trade-off**: One-time approval, better UX for repeat users
- **Recent Exploits** (2024):
  - Li.Fi Protocol: $9.7M lost
  - ParaSwap Augustus V6: User losses from vulnerability
  - SocketDotTech (Bungee): $3.3M lost
- **Best For**: Trusted, audited, immutable contracts only

**Modern Solutions**:

1. **Permit2** (2024+):
   - One-time approval to Permit2 contract
   - Off-chain signatures for granular approvals
   - Time-limited approvals
   - Batch operations support

2. **ERC20Permit**:
   - Gasless approvals via signatures
   - Not all tokens support it
   - Better UX when available

**Recommended Implementation**:
```javascript
// Default: Exact amount
function approveExact(tokenAddress, spender, amount) {
  return erc20.approve(spender, amount);
}

// Optional: Unlimited (with user warning)
function approveUnlimited(tokenAddress, spender) {
  // Show prominent warning to user
  return erc20.approve(spender, MAX_UINT256);
}

// Best: Check and approve only if needed
async function ensureApproval(token, spender, requiredAmount) {
  const currentAllowance = await token.allowance(userAddress, spender);
  if (currentAllowance < requiredAmount) {
    await token.approve(spender, requiredAmount);
  }
}
```

**Consensus**: **Exact amount approvals are significantly more secure** than unlimited approvals, though they require more transactions.

### 6. Complete User Flow Best Practices

#### Recommended UX Flow
1. **Display Balance**: Show immediately when token is selected
2. **Quick Selectors**: 25/50/75/100% buttons visible
3. **Auto-Calculate**: When amount A is entered, calculate amount B
4. **Show Ratio**: Display "1 TOKEN_A = X TOKEN_B"
5. **Exact Approvals**: Request exact amount needed
6. **Configurable Slippage**: Default 0.5%, user can adjust
7. **Transaction Summary**: Show all details before execution
8. **Progress Indicators**: Clear status during multi-step process

#### Error Prevention
- Validate sufficient balance before allowing submission
- Show warning if slippage is high (> 1%)
- Prevent submission if ratio is incorrect
- Display gas estimates
- Show total cost including fees

#### Transaction Transparency
- Exact approval amounts shown
- Slippage tolerance displayed
- Expected output amounts with min/max
- Transaction breakdown (approval → pool creation → liquidity add)

---

## Implementation Plan

### Phase 1: Backend API Enhancements

#### 1.1 Add Token Balance Endpoint
**File**: Create `/packages/nextjs/app/api/token-balance/route.ts`

**Purpose**: Fetch ERC20 token balance for a wallet

**Interface**:
```typescript
POST /app/api/token-balance
Request: { tokenAddress: string, walletAddress: string }
Response: {
  balanceWei: string,
  balanceFormatted: string,
  decimals: number
}
```

**Implementation**:
- Use ethers.js or web3.js
- Minimal ERC20 ABI (balanceOf only)
- Handle decimals correctly
- Cache results for 10 seconds

#### 1.2 Add Pool Price Endpoint
**File**: Create `/packages/nextjs/app/api/pool-price/route.ts`

**Purpose**: Get current pool price for ratio calculation

**Interface**:
```typescript
POST /app/api/pool-price
Request: {
  version: 'v2' | 'v3' | 'v4',
  token0: string,
  token1: string,
  fee?: number
}
Response: {
  exists: boolean,
  sqrtPriceX96?: string,
  price?: number,
  token0Symbol: string,
  token1Symbol: string
}
```

**Implementation**:
- Query Uniswap pool contract
- Extract sqrtPriceX96 or reserves
- Calculate human-readable price
- Return null if pool doesn't exist

#### 1.3 Update Approval Transaction Builder
**File**: Modify `/packages/nextjs/app/api/build-approval/route.ts`

**Purpose**: Support exact amount approvals

**Current Interface**:
```typescript
POST /app/api/build-approval
Request: { token: string, spender: string }
Response: { to: string, data: string, value: string }
```

**Updated Interface**:
```typescript
POST /app/api/build-approval
Request: {
  token: string,
  spender: string,
  amount?: string,  // NEW: optional exact amount
  unlimited?: boolean  // NEW: explicit unlimited flag
}
Response: {
  to: string,
  data: string,
  value: string,
  approvalAmount: string,  // NEW: for UI display
  isUnlimited: boolean     // NEW: for UI warning
}
```

**Implementation**:
- Default to exact amount if provided
- Require explicit `unlimited: true` for max approval
- Encode approval amount in transaction data
- Return approval details for UI display

#### 1.4 Add Calculate Liquidity Ratio Endpoint
**File**: Create `/packages/nextjs/app/api/calculate-ratio/route.ts`

**Purpose**: Calculate required amount for second token

**Interface**:
```typescript
POST /app/api/calculate-ratio
Request: {
  version: 'v2' | 'v3' | 'v4',
  token0: string,
  token1: string,
  fee?: number,
  amount0?: string,
  amount1?: string,
  decimals0: number,
  decimals1: number
}
Response: {
  amount0: string,
  amount1: string,
  price: number,
  priceDisplay: string  // e.g., "1 WETH = 2500 USDC"
}
```

**Implementation**:
- Fetch pool price
- Calculate missing amount based on provided amount
- Handle decimals correctly
- Return formatted display string

### Phase 2: Frontend Service Layer

#### 2.1 Update API Service
**File**: `/packages/nextjs/services/api.ts`

**Add Functions**:
```typescript
// Fetch token balance
export async function fetchTokenBalance(
  tokenAddress: string,
  walletAddress: string
): Promise<{
  balanceWei: string;
  balanceFormatted: string;
  decimals: number;
}> {
  const res = await fetch(`${API_BASE}/token-balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenAddress, walletAddress }),
  });
  if (!res.ok) throw new Error('Failed to fetch balance');
  return res.json();
}

// Get pool price
export async function fetchPoolPrice(params: {
  version: string;
  token0: string;
  token1: string;
  fee?: number;
}): Promise<{
  exists: boolean;
  price?: number;
  priceDisplay?: string;
}> {
  const res = await fetch(`${API_BASE}/pool-price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to fetch pool price');
  return res.json();
}

// Calculate liquidity ratio
export async function calculateLiquidityRatio(params: {
  version: string;
  token0: string;
  token1: string;
  fee?: number;
  amount0?: string;
  amount1?: string;
  decimals0: number;
  decimals1: number;
}): Promise<{
  amount0: string;
  amount1: string;
  price: number;
  priceDisplay: string;
}> {
  const res = await fetch(`${API_BASE}/calculate-ratio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to calculate ratio');
  return res.json();
}

// Updated: Build approval transaction with exact amount
export async function buildApprovalTransaction(
  token: string,
  spender: string,
  amount?: string,
  unlimited?: boolean
): Promise<{
  to: string;
  data: string;
  value: string;
  approvalAmount: string;
  isUnlimited: boolean;
}> {
  const res = await fetch(`${API_BASE}/build-approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, spender, amount, unlimited }),
  });
  if (!res.ok) throw new Error('Failed to build approval');
  return res.json();
}
```

### Phase 3: UI Components

#### 3.1 Create BalanceDisplay Component
**File**: `/packages/nextjs/components/BalanceDisplay.tsx`

**Purpose**: Reusable balance display with loading states

**Interface**:
```typescript
interface BalanceDisplayProps {
  tokenAddress: string;
  walletAddress: string;
  symbol: string;
  onBalanceLoaded?: (balance: string) => void;
}
```

**Features**:
- Auto-fetch balance on mount
- Loading spinner while fetching
- Refresh on wallet or token change
- Format balance with proper decimals
- Optional USD value display

#### 3.2 Create QuickSelectButtons Component
**File**: `/packages/nextjs/components/QuickSelectButtons.tsx`

**Purpose**: 25/50/75/100% balance selector buttons

**Interface**:
```typescript
interface QuickSelectButtonsProps {
  balance: string;
  decimals: number;
  onAmountSelect: (amount: string) => void;
  disabled?: boolean;
}
```

**Features**:
- Four buttons: 25%, 50%, 75%, 100%
- Calculate percentage of balance
- Trigger callback with formatted amount
- Disabled state support
- Active state highlighting

#### 3.3 Create SlippageControl Component
**File**: `/packages/nextjs/components/SlippageControl.tsx`

**Purpose**: User-configurable slippage tolerance

**Interface**:
```typescript
interface SlippageControlProps {
  value: number;  // Current slippage (0.5 = 0.5%)
  onChange: (value: number) => void;
  pairType?: 'stable' | 'standard' | 'volatile';
}
```

**Features**:
- Preset buttons: 0.1%, 0.5%, 1%, 3%
- Custom input field
- Warning for slippage > 1%
- Suggested defaults based on pair type

### Phase 4: Update Create Pool Page

#### 4.1 Add State Management
**File**: `/packages/nextjs/app/create-pool/page.tsx`

**New State Variables**:
```typescript
const [balanceA, setBalanceA] = useState<string>('')
const [balanceB, setBalanceB] = useState<string>('')
const [loadingBalanceA, setLoadingBalanceA] = useState(false)
const [loadingBalanceB, setLoadingBalanceB] = useState(false)
const [currentPrice, setCurrentPrice] = useState<number | null>(null)
const [priceDisplay, setPriceDisplay] = useState<string>('')
const [slippageTolerance, setSlippageTolerance] = useState(0.5)
const [showSlippageSettings, setShowSlippageSettings] = useState(false)
```

#### 4.2 Add Balance Fetching Logic
```typescript
// Effect: Load balance for token A
useEffect(() => {
  if (!wallet || !tokenA?.address) {
    setBalanceA('')
    return
  }

  setLoadingBalanceA(true)
  fetchTokenBalance(tokenA.address, wallet)
    .then(({ balanceFormatted }) => {
      setBalanceA(balanceFormatted)
      setLoadingBalanceA(false)
    })
    .catch(err => {
      console.error('Failed to fetch balance A:', err)
      setLoadingBalanceA(false)
    })
}, [wallet, tokenA?.address])

// Similar effect for token B
```

#### 4.3 Add Auto-Calculation Logic
```typescript
// Effect: Calculate amount B when amount A changes
useEffect(() => {
  if (!amountA || !tokenA || !tokenB || parseFloat(amountA) === 0) {
    return
  }

  calculateLiquidityRatio({
    version,
    token0: tokenA.address,
    token1: tokenB.address,
    fee: version !== 'v2' ? feeTier : undefined,
    amount0: amountA,
    decimals0: tokenA.decimals,
    decimals1: tokenB.decimals,
  })
    .then(({ amount1, priceDisplay }) => {
      setAmountB(amount1)
      setPriceDisplay(priceDisplay)
    })
    .catch(err => {
      console.error('Failed to calculate ratio:', err)
    })
}, [amountA, tokenA, tokenB, version, feeTier])

// Similar effect for amount B → amount A
```

#### 4.4 Update UI - Balance Display
**Replace** lines 551 and 569:

**Before**:
```tsx
<span className="input-balance">Balance: --</span>
```

**After**:
```tsx
<span className="input-balance">
  Balance: {loadingBalanceA ? (
    <span className="spinner-small"></span>
  ) : balanceA ? (
    <>
      {parseFloat(balanceA).toFixed(6)} {tokenA.symbol}
      {parseFloat(balanceA) < parseFloat(amountA) && (
        <span className="text-error"> (Insufficient)</span>
      )}
    </>
  ) : (
    '--'
  )}
</span>
```

#### 4.5 Update UI - Add Quick Select Buttons
**Add after** balance display (around line 552):

```tsx
{balanceA && (
  <div className="quick-select-buttons">
    <button
      className="quick-select-btn"
      onClick={() => handleQuickSelect('A', 0.25)}
    >
      25%
    </button>
    <button
      className="quick-select-btn"
      onClick={() => handleQuickSelect('A', 0.5)}
    >
      50%
    </button>
    <button
      className="quick-select-btn"
      onClick={() => handleQuickSelect('A', 0.75)}
    >
      75%
    </button>
    <button
      className="quick-select-btn"
      onClick={() => handleQuickSelect('A', 1.0)}
    >
      100%
    </button>
  </div>
)}
```

**Handler Function**:
```typescript
function handleQuickSelect(token: 'A' | 'B', percentage: number) {
  const balance = token === 'A' ? balanceA : balanceB
  const amount = (parseFloat(balance) * percentage).toFixed(6)

  if (token === 'A') {
    setAmountA(amount)
  } else {
    setAmountB(amount)
  }
}
```

#### 4.6 Update UI - Slippage Control
**Add before** "Initial Liquidity" section:

```tsx
<div className="create-section">
  <div className="section-header">
    <h3 className="section-title">Slippage Tolerance</h3>
    <button
      className="settings-toggle"
      onClick={() => setShowSlippageSettings(!showSlippageSettings)}
    >
      {slippageTolerance}% {showSlippageSettings ? '▲' : '▼'}
    </button>
  </div>

  {showSlippageSettings && (
    <div className="slippage-settings">
      <div className="slippage-presets">
        {[0.1, 0.5, 1.0, 3.0].map(preset => (
          <button
            key={preset}
            className={`slippage-btn ${slippageTolerance === preset ? 'selected' : ''}`}
            onClick={() => setSlippageTolerance(preset)}
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
          value={slippageTolerance}
          onChange={(e) => setSlippageTolerance(parseFloat(e.target.value))}
          className="slippage-input"
        />
        <span>%</span>
      </div>
      {slippageTolerance > 1 && (
        <div className="slippage-warning">
          ⚠️ High slippage tolerance may result in unfavorable trade
        </div>
      )}
    </div>
  )}
</div>
```

#### 4.7 Update Approval Logic - Exact Amounts
**Modify** approval section (around line 260-294):

**Before**:
```typescript
if (approvalStatus.token0NeedsApproval) {
  approvalTxs.push({
    ...(await buildApprovalTransaction(tokenA.address, spender)),
    tokenSymbol: tokenA.symbol,
  })
}
```

**After**:
```typescript
if (approvalStatus.token0NeedsApproval) {
  const approval = await buildApprovalTransaction(
    tokenA.address,
    spender,
    amount0Wei,  // Exact amount
    false        // Not unlimited
  )

  approvalTxs.push({
    ...approval,
    tokenSymbol: tokenA.symbol,
  })

  // Show user what they're approving
  console.log(`Approving exactly ${amountA} ${tokenA.symbol}`)
}
```

#### 4.8 Update Transaction Building - Use Dynamic Slippage
**Modify** line 308:

**Before**:
```typescript
slippageTolerance: 0.5,
```

**After**:
```typescript
slippageTolerance: slippageTolerance,
```

#### 4.9 Add Validation Before Submission
**Add before** `handleCreatePool()` execution:

```typescript
function validatePoolCreation(): string | null {
  if (!wallet || !tokenA || !tokenB) {
    return 'Missing required information'
  }

  if (!amountA || !amountB) {
    return 'Please enter both token amounts'
  }

  const amountAFloat = parseFloat(amountA)
  const amountBFloat = parseFloat(amountB)

  if (amountAFloat <= 0 || amountBFloat <= 0) {
    return 'Amounts must be greater than zero'
  }

  if (balanceA && amountAFloat > parseFloat(balanceA)) {
    return `Insufficient ${tokenA.symbol} balance`
  }

  if (balanceB && amountBFloat > parseFloat(balanceB)) {
    return `Insufficient ${tokenB.symbol} balance`
  }

  return null
}

// In handleCreatePool():
const validationError = validatePoolCreation()
if (validationError) {
  setState({ error: validationError })
  return
}
```

### Phase 5: Update Add Liquidity Page

#### 5.1 Apply Same Patterns to Position Page
**File**: `/packages/nextjs/app/position/[id]/page.tsx`

**Changes**:
1. Add balance fetching for both tokens (lines 33-36)
2. Add QuickSelectButtons component to add liquidity form (line 425-445)
3. Add auto-calculation when one amount changes
4. Fix hard-coded decimals issue (lines 114-117)
5. Add slippage control (currently hard-coded at 0.5%)
6. Update approval logic to use exact amounts
7. Add validation for sufficient balance

### Phase 6: Styling

#### 6.1 Add Component Styles
**File**: `/packages/nextjs/styles/globals.css`

**Add Styles**:
```css
/* Balance Display */
.input-balance {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.spinner-small {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.text-error {
  color: var(--error);
  font-weight: 600;
}

/* Quick Select Buttons */
.quick-select-buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.quick-select-btn {
  flex: 1;
  padding: 0.5rem;
  background: var(--background-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.quick-select-btn:hover {
  background: var(--background-tertiary);
  border-color: var(--primary);
}

.quick-select-btn:active {
  background: var(--primary);
  color: white;
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
  background: var(--background-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.slippage-settings {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--background-secondary);
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
  background: var(--background);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.slippage-btn.selected {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.slippage-custom {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.slippage-input {
  flex: 1;
  padding: 0.75rem;
  background: var(--background);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 1rem;
}

.slippage-warning {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: var(--warning-background);
  border: 1px solid var(--warning);
  border-radius: 8px;
  font-size: 0.875rem;
  color: var(--warning-text);
}

/* Animations */
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### Phase 7: Testing & Validation

#### 7.1 Test Cases

**Balance Display**:
- ✅ Balance loads when token is selected
- ✅ Balance updates when wallet changes
- ✅ Loading spinner appears during fetch
- ✅ "Insufficient" warning shows when amount > balance
- ✅ Works for both common and custom tokens

**Quick Select Buttons**:
- ✅ 25% button sets correct amount
- ✅ 50% button sets correct amount
- ✅ 75% button sets correct amount
- ✅ 100% button sets correct amount
- ✅ Buttons trigger auto-calculation for other token
- ✅ Manual input still works after clicking button

**Auto-Calculation**:
- ✅ Typing amount A calculates amount B
- ✅ Typing amount B calculates amount A
- ✅ Calculation respects current pool price
- ✅ Handles tokens with different decimals
- ✅ Shows price display (e.g., "1 WETH = 2500 USDC")

**Slippage Control**:
- ✅ Default is 0.5%
- ✅ Preset buttons work (0.1%, 0.5%, 1%, 3%)
- ✅ Custom input accepts decimal values
- ✅ Warning appears when slippage > 1%
- ✅ Slippage is used in transaction building

**Token Approvals**:
- ✅ Exact amount is requested (not unlimited)
- ✅ Approval amount is logged/displayed
- ✅ Works for both token A and token B
- ✅ Approval succeeds before pool creation

**Validation**:
- ✅ Cannot submit with insufficient balance
- ✅ Cannot submit with zero amounts
- ✅ Cannot submit without both tokens selected
- ✅ Error messages are clear and helpful

#### 7.2 Edge Cases

**Extreme Decimals**:
- Test with USDC (6 decimals)
- Test with WETH (18 decimals)
- Test with custom tokens (various decimals)

**Very Small Amounts**:
- Test with 0.000001 token amounts
- Ensure precision is maintained

**Very Large Amounts**:
- Test with amounts exceeding balance
- Test with max uint256

**Pool States**:
- Test with existing pools
- Test with non-existent pools
- Test when pool creation fails

**Network Issues**:
- Test when balance fetch fails
- Test when ratio calculation fails
- Test when approval transaction fails

### Phase 8: Documentation

#### 8.1 Update User Guide
**File**: Create `/packages/nextjs/docs/USER_GUIDE.md`

**Sections**:
1. How to view token balances
2. Using quick select buttons (25/50/75/100%)
3. Understanding auto-calculation
4. Adjusting slippage tolerance
5. Token approval process (exact vs unlimited)
6. Troubleshooting common issues

#### 8.2 Update Developer Docs
**File**: Create `/packages/nextjs/docs/DEVELOPER.md`

**Sections**:
1. Balance fetching implementation
2. Ratio calculation math
3. Approval transaction patterns
4. Slippage protection implementation
5. Component architecture
6. Testing guidelines

---

## Summary

This implementation plan transforms the LP creation experience from a basic manual input system to a sophisticated, user-friendly interface following industry best practices:

### Key Improvements
1. **Visibility**: Real-time balance display
2. **Convenience**: 25/50/75/100% quick select buttons
3. **Accuracy**: Automatic ratio calculation
4. **Security**: Exact amount approvals
5. **Control**: User-configurable slippage
6. **Safety**: Comprehensive validation

### Implementation Order
1. Backend API endpoints (balance, price, ratio)
2. Frontend service functions
3. UI components (reusable)
4. Update Create Pool page
5. Update Add Liquidity page
6. Styling and polish
7. Testing and validation
8. Documentation

### Expected Outcome
Users will be able to:
- See their token balances immediately
- Click a button to select common percentages
- Watch amounts auto-calculate based on pool price
- Control exactly how much they approve
- Adjust slippage to their preference
- Get clear feedback about transaction status
- Feel confident they're using industry best practices

**Status**: Ready for implementation approval ✅
