# V4 Approval Flow Analysis

## Current Problems

### 1. INFINITE LOOP in useEffects
The `add-liquidity/page.tsx` has cascading useEffects that may be causing infinite API calls:

```
useEffect 1 (line 135): token0Address, token1Address changes
  → calls updateState({ token0Info, token1Info })

useEffect 2 (line 158): token0Info, token1Info changes
  → calls updateState({ poolExists, currentPoolPrice })
  → ALSO triggers useEffect 3 and 4

useEffect 3 (line 217): step, token0Info?.address, token1Info?.address
  → calls updateState({ token0UsdPrice, token1UsdPrice, ... })

useEffect 4 (line 251): wallet, token0Info, token1Info
  → fetches balances
```

**Problem**: If any useEffect causes a state update that triggers another useEffect, we get cascading re-renders and API calls.

### 2. NO APPROVAL STATE CACHING
Current flow ALWAYS asks for 4 approvals for V4:
1. Token0 → Permit2 (ERC20 approve)
2. Token0: Permit2 → V4_PM (Permit2.approve)
3. Token1 → Permit2 (ERC20 approve)
4. Token1: Permit2 → V4_PM (Permit2.approve)

**Problem**: We never check if approvals already exist on-chain before prompting user.

### 3. APPROVAL CHECK API NOT BEING USED
We have `/api/check-approvals` with V4 support but the frontend doesn't call it before showing approval buttons!

The API returns:
```json
{
  "token0": { "needsErc20Approval": bool, "needsPermit2Approval": bool },
  "token1": { "needsErc20Approval": bool, "needsPermit2Approval": bool }
}
```

But the frontend just shows "Approve" buttons without checking first.

---

## What SHOULD Happen

### On Step 3 Load (Deposit Step):
1. Call `/api/check-approvals` with `version: 'V4'`
2. Store results in state:
   - `token0NeedsErc20Approval`
   - `token0NeedsPermit2Approval`
   - `token1NeedsErc20Approval`
   - `token1NeedsPermit2Approval`
3. Only show "Approve" button if approval actually needed
4. If already approved, show checkmark immediately

### On Approve Click:
1. Check which approval is needed (ERC20 or Permit2)
2. Only send the transaction that's actually needed
3. After confirmation, re-check to see if more approvals needed
4. Update UI accordingly

### Approval Status Should Be:
- `idle` - not checked yet
- `checking` - calling check-approvals API
- `needs_erc20` - needs ERC20 approval to Permit2
- `needs_permit2` - needs Permit2.approve to V4_PM
- `signing` - user signing tx
- `confirming` - waiting for tx confirmation
- `confirmed` - all approvals complete
- `error` - something failed

---

## Files to Fix

1. **`/packages/nextjs/app/add-liquidity/page.tsx`**
   - Add approval checking on step 3 entry
   - Fix useEffect dependencies to prevent loops
   - Only prompt for approvals that are actually needed

2. **State Changes Needed**:
   ```typescript
   // Replace single ApprovalStatus with granular tracking
   token0Erc20Approved: boolean
   token0Permit2Approved: boolean
   token1Erc20Approved: boolean
   token1Permit2Approved: boolean
   approvalCheckDone: boolean
   ```

---

## Root Cause Summary

1. **No approval pre-check**: We prompt for ALL approvals without checking on-chain state
2. **useEffect cascade**: Multiple effects triggering each other = API spam
3. **Two-step approval not smart**: Should skip steps that are already done
