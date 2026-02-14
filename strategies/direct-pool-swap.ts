/**
 * Direct V4 Pool Swap
 *
 * Executes a swap directly through a specific V4 pool without routing.
 * For use with our own pools where we want to control which pool handles the trade.
 * Supports both ERC20-to-ERC20 and native ETH swaps.
 *
 * Usage:
 *   # ERC20 swap (flaunch pool, default)
 *   npx ts-node strategies/direct-pool-swap.ts \
 *     --tokenIn MLTL --tokenOut CHAOS --amount 15000 --dry-run
 *
 *   # Buy >e with native ETH from Clanker pool
 *   npx ts-node strategies/direct-pool-swap.ts \
 *     --tokenIn ETH --tokenOut GE --amount 0.0001 --hook clanker --tick-spacing 60 --dry-run
 *
 *   # Execute for real (remove --dry-run, add --execute)
 *   npx ts-node strategies/direct-pool-swap.ts \
 *     --tokenIn ETH --tokenOut GE --amount 0.0001 --hook clanker --tick-spacing 60 --execute
 *
 * Hooks:
 *   --hook flaunch   Flaunch V4 hook (default) — fee=dynamic, tickSpacing=200
 *   --hook clanker   Clanker V4 hook — fee=dynamic, tickSpacing=60
 *   --hook none      No hook (vanilla V4 pool)
 *
 * Native ETH:
 *   When --tokenIn ETH, default behavior wraps ETH→WETH for the pool key.
 *   Use --native-eth when the pool uses address(0) (native ETH) instead of WETH.
 *   Example: npx ts-node strategies/direct-pool-swap.ts \
 *     --tokenIn ETH --tokenOut flETH --amount 0.002 --hook none --fee 3000 --native-eth --dry-run
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, formatEther, encodeAbiParameters, encodeFunctionData, type Hex, type Address } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as fs from 'fs';
import * as path from 'path';

const RPC = process.env.BASE_RPC || 'https://mainnet.base.org';

// Native ETH represented as address(0) in V4
const NATIVE_ETH: Address = '0x0000000000000000000000000000000000000000';

// Token registry
const TOKENS: Record<string, { address: Address; decimals: number; native?: boolean }> = {
  // Native ETH — uses address(0) in V4 pool keys
  ETH:    { address: NATIVE_ETH, decimals: 18, native: true },
  // Wrapped ETH — for pools that use WETH instead of native
  WETH:   { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  // Ecosystem tokens
  CHAOS:  { address: '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292', decimals: 18 },
  MLTL:   { address: '0xa448d40f6793773938a6b7427091c35676899125', decimals: 18 },
  ARBME:  { address: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07', decimals: 18 },
  WOLF:   { address: '0xc3a366c03a0fc57d96065e3adb27dd0036d83b80', decimals: 18 },
  EDGE:   { address: '0x1966a17d806a79f742e6e228ecc9421f401a8a32', decimals: 18 },
  flETH:  { address: '0x000000000D564D5be76f7f0d28fE52605afC7Cf8', decimals: 18 },
  USDC:   { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  RATCHET:{ address: '0x392bc5deea227043d69af0e67badcbbaed511b07', decimals: 18 },
  OSO:    { address: '0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e', decimals: 18 },
  // Experimental tokens
  GE:     { address: '0x3709920493e96b1485f722d2c20ce4b06be5fb07', decimals: 18 }, // >e (³ee)
};

// Hook presets
const HOOKS: Record<string, Address> = {
  flaunch: '0x9E433F32bb5481a9CA7DFF5b3af74A7ed041a888',
  clanker: '0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC',
  none:    '0x0000000000000000000000000000000000000000',
};

// Default pool params per hook
const HOOK_DEFAULTS: Record<string, { fee: number; tickSpacing: number }> = {
  flaunch: { fee: 8388608, tickSpacing: 200 },  // dynamic fee, wide ticks
  clanker: { fee: 8388608, tickSpacing: 60 },   // dynamic fee, standard ticks
  none:    { fee: 3000,    tickSpacing: 60 },    // 0.3% static, standard ticks
};

// V4 Universal Router
const UNIVERSAL_ROUTER: Address = '0x6ff5693b99212da76ad316178a184ab56d299b43';

// V4 StateView for pool queries
const STATE_VIEW: Address = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';

// ERC20 ABI for approvals
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Permit2 for V4 swaps
const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const PERMIT2_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
] as const;

// Universal Router execute ABI
const UNIVERSAL_ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

function loadWallet(): { address: Address; privateKey: Hex } {
  const walletPath = path.join(process.env.HOME || '', '.moltlaunch', 'wallet.json');
  const data = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return {
    address: data.address as Address,
    privateKey: data.privateKey as Hex,
  };
}

function printUsage() {
  console.log(`
Direct V4 Pool Swap

Usage:
  npx ts-node strategies/direct-pool-swap.ts [options]

Options:
  --tokenIn <SYM>       Input token symbol (default: MLTL)
  --tokenOut <SYM>      Output token symbol (default: CHAOS)
  --amount <N>          Amount of input token (default: 15000)
  --hook <type>         Hook: flaunch | clanker | none (default: flaunch)
  --fee <N>             Override pool fee (default: per hook)
  --tick-spacing <N>    Override tick spacing (default: per hook)
  --native-eth          Pool uses native ETH (address 0), not WETH
  --slippage <N>        Slippage % (default: 10)
  --dry-run             Simulate only (default)
  --execute             Execute for real

Available tokens: ${Object.keys(TOKENS).join(', ')}
Available hooks: ${Object.keys(HOOKS).join(', ')}
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  let tokenInSymbol = 'MLTL';
  let tokenOutSymbol = 'CHAOS';
  let amount = 15000;
  let dryRun = true;
  let slippagePercent = 10;
  let hookName = 'flaunch';
  let feeOverride: number | null = null;
  let tickSpacingOverride: number | null = null;
  let hookAddressOverride: Address | null = null;
  let nativeEthPool = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tokenIn' && args[i + 1]) tokenInSymbol = args[++i].toUpperCase();
    else if (args[i] === '--tokenOut' && args[i + 1]) tokenOutSymbol = args[++i].toUpperCase();
    else if (args[i] === '--amount' && args[i + 1]) amount = parseFloat(args[++i]);
    else if (args[i] === '--slippage' && args[i + 1]) slippagePercent = parseFloat(args[++i]);
    else if (args[i] === '--hook' && args[i + 1]) hookName = args[++i].toLowerCase();
    else if (args[i] === '--hook-address' && args[i + 1]) hookAddressOverride = args[++i] as Address;
    else if (args[i] === '--fee' && args[i + 1]) feeOverride = parseInt(args[++i]);
    else if (args[i] === '--tick-spacing' && args[i + 1]) tickSpacingOverride = parseInt(args[++i]);
    else if (args[i] === '--execute') dryRun = false;
    else if (args[i] === '--dry-run') dryRun = true;
  }

  // Case-insensitive token lookup (handles flETH vs FLETH etc.)
  const findToken = (sym: string) => {
    const exact = TOKENS[sym];
    if (exact) return { key: sym, token: exact };
    const match = Object.entries(TOKENS).find(([k]) => k.toUpperCase() === sym.toUpperCase());
    return match ? { key: match[0], token: match[1] } : null;
  };
  const inMatch = findToken(tokenInSymbol);
  const outMatch = findToken(tokenOutSymbol);
  if (inMatch) tokenInSymbol = inMatch.key;
  if (outMatch) tokenOutSymbol = outMatch.key;
  const tokenIn = inMatch?.token;
  const tokenOut = outMatch?.token;

  if (!tokenIn || !tokenOut) {
    console.error(`Unknown token: ${tokenInSymbol} or ${tokenOutSymbol}`);
    console.error(`Available: ${Object.keys(TOKENS).join(', ')}`);
    process.exit(1);
  }

  let hookAddress: Address;
  if (hookAddressOverride) {
    hookAddress = hookAddressOverride;
    hookName = hookAddressOverride.slice(0, 10) + '...';
  } else {
    hookAddress = HOOKS[hookName];
    if (!hookAddress) {
      console.error(`Unknown hook: ${hookName}`);
      console.error(`Available: ${Object.keys(HOOKS).join(', ')}`);
      process.exit(1);
    }
  }

  const defaults = HOOK_DEFAULTS[hookName] || HOOK_DEFAULTS.none;
  const fee = feeOverride ?? defaults.fee;
  const tickSpacing = tickSpacingOverride ?? defaults.tickSpacing;

  const isNativeIn = !!tokenIn.native;
  const isNativeOut = !!tokenOut.native;

  console.log('\n=== Direct V4 Pool Swap ===\n');
  console.log(`Swap: ${amount} ${tokenInSymbol} -> ${tokenOutSymbol}`);
  console.log(`Hook: ${hookName} (${hookAddress})`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : '** LIVE **'}`);
  console.log('');

  const wallet = loadWallet();
  const pub = createPublicClient({ chain: base, transport: http(RPC) });
  const account = privateKeyToAccount(wallet.privateKey);
  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC) });

  // Check balance
  let balance: bigint;
  if (isNativeIn) {
    balance = await pub.getBalance({ address: wallet.address });
    console.log(`Wallet: ${wallet.address}`);
    console.log(`Balance: ${formatEther(balance)} ETH (native)`);
  } else {
    balance = await pub.readContract({
      address: tokenIn.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [wallet.address],
    });
    console.log(`Wallet: ${wallet.address}`);
    console.log(`Balance: ${formatUnits(balance, tokenIn.decimals)} ${tokenInSymbol}`);
  }

  const amountWei = parseUnits(amount.toString(), tokenIn.decimals);
  console.log(`Swapping: ${amount} ${tokenInSymbol} (${amountWei.toString()} wei)`);

  if (balance < amountWei) {
    console.error(`\nInsufficient balance!`);
    process.exit(1);
  }

  // Build pool key
  // When paying with native ETH, the pool actually uses WETH — we wrap automatically
  const wethAddress = '0x4200000000000000000000000000000000000006' as Address;
  const needsWrap = isNativeIn;
  const poolInAddr = needsWrap ? wethAddress : tokenIn.address;
  const poolOutAddr = isNativeOut ? wethAddress : tokenOut.address;
  const token0 = poolInAddr.toLowerCase() < poolOutAddr.toLowerCase() ? poolInAddr : poolOutAddr;
  const token1 = poolInAddr.toLowerCase() < poolOutAddr.toLowerCase() ? poolOutAddr : poolInAddr;
  const zeroForOne = poolInAddr.toLowerCase() === token0.toLowerCase();

  if (needsWrap) {
    console.log(`\nAuto-wrap: ETH -> WETH for pool settlement`);
  }

  console.log(`\nPool key:`);
  console.log(`  currency0: ${token0}${token0 === NATIVE_ETH ? ' (native ETH)' : ''}`);
  console.log(`  currency1: ${token1}`);
  console.log(`  fee: ${fee} (${fee === 8388608 ? 'dynamic' : (fee/10000).toFixed(2) + '%'})`);
  console.log(`  tickSpacing: ${tickSpacing}`);
  console.log(`  hooks: ${hookAddress} (${hookName})`);
  console.log(`  zeroForOne: ${zeroForOne}`);

  // For discovery swaps, use 0 minAmountOut (accept any output)
  // For production, calculate based on oracle/quote
  const minAmountOutWei = BigInt(0);
  console.log(`\nSlippage: ${slippagePercent}% (minOut: 0 for discovery)`);

  if (dryRun) {
    console.log('\nDry run complete. Use --execute to swap.');
    return;
  }

  // --- Approvals (skip for native ETH input) ---
  if (!isNativeIn) {
    console.log('\n--- Checking approvals ---');

    const permit2Allowance = await pub.readContract({
      address: tokenIn.address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [wallet.address, PERMIT2],
    });

    if (permit2Allowance < amountWei) {
      console.log(`Approving ${tokenInSymbol} for Permit2...`);
      const approveTx = await walletClient.writeContract({
        address: tokenIn.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PERMIT2, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
      });
      console.log(`  TX: ${approveTx}`);
      await pub.waitForTransactionReceipt({ hash: approveTx });
      console.log(`  Approved`);
    } else {
      console.log(`  ${tokenInSymbol} already approved for Permit2`);
    }

    const [routerAllowance] = await pub.readContract({
      address: PERMIT2,
      abi: PERMIT2_ABI,
      functionName: 'allowance',
      args: [wallet.address, tokenIn.address, UNIVERSAL_ROUTER],
    });

    if (routerAllowance < amountWei) {
      console.log(`Approving Permit2 for Universal Router...`);
      const expiration = Math.floor(Date.now() / 1000) + 86400 * 30;
      const permit2ApproveTx = await walletClient.writeContract({
        address: PERMIT2,
        abi: PERMIT2_ABI,
        functionName: 'approve',
        args: [tokenIn.address, UNIVERSAL_ROUTER, BigInt('0xffffffffffffffffffffffffffffffff'), expiration],
      });
      console.log(`  TX: ${permit2ApproveTx}`);
      await pub.waitForTransactionReceipt({ hash: permit2ApproveTx });
      console.log(`  Approved`);
    } else {
      console.log(`  Permit2 already approved for Universal Router`);
    }
  } else {
    console.log('\n--- Native ETH: no approvals needed ---');
  }

  // --- Build and execute swap ---
  console.log('\n--- Executing swap ---');

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  // V4 actions differ based on who holds the input tokens:
  // - SETTLE_ALL (0x0c): pulls from user via Permit2 (for ERC20 swaps)
  // - SETTLE (0x09): can use router's own balance (for ETH->WETH wrap flow)
  const v4Actions = needsWrap
    ? '0x06090f' as `0x${string}`   // SWAP_EXACT_IN_SINGLE + SETTLE + TAKE_ALL
    : '0x060c0f' as `0x${string}`;  // SWAP_EXACT_IN_SINGLE + SETTLE_ALL + TAKE_ALL

  const swapParams = encodeAbiParameters(
    [{
      type: 'tuple',
      components: [
        { type: 'tuple', name: 'poolKey', components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ]},
        { name: 'zeroForOne', type: 'bool' },
        { name: 'amountIn', type: 'uint128' },
        { name: 'amountOutMinimum', type: 'uint128' },
        { name: 'hookData', type: 'bytes' },
      ],
    }],
    [{
      poolKey: {
        currency0: token0,
        currency1: token1,
        fee: fee,
        tickSpacing: tickSpacing,
        hooks: hookAddress,
      },
      zeroForOne: zeroForOne,
      amountIn: amountWei,
      amountOutMinimum: minAmountOutWei,
      hookData: '0x' as `0x${string}`,
    }]
  );

  // Settlement params depend on whether we're wrapping ETH
  let settleParams: `0x${string}`;
  if (needsWrap) {
    // SETTLE (0x09): (currency, amount, payerIsUser)
    // payerIsUser=false means router pays from its own WETH balance (from WRAP_ETH)
    settleParams = encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }],
      [poolInAddr, amountWei, false]
    );
  } else {
    // SETTLE_ALL (0x0c): (currency, maxAmount) — pulls from user via Permit2
    settleParams = encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [poolInAddr, amountWei]
    );
  }

  // TAKE_ALL for the output currency
  const takeParams = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [poolOutAddr, minAmountOutWei]
  );

  const v4Input = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [v4Actions, [swapParams, settleParams, takeParams]]
  );

  let commands: `0x${string}`;
  let inputs: `0x${string}`[];

  if (needsWrap) {
    // WRAP_ETH (0x0b) + V4_SWAP (0x10)
    // WRAP_ETH input: abi.encode(address recipient, uint256 amountMin)
    // ADDRESS_THIS = address(2) in Universal Router convention
    const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as Address;
    const wrapInput = encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [ADDRESS_THIS, amountWei]
    );
    commands = '0x0b10';
    inputs = [wrapInput, v4Input];
    console.log(`Commands: WRAP_ETH + V4_SWAP`);
  } else {
    // V4_SWAP only (0x10)
    commands = '0x10';
    inputs = [v4Input];
    console.log(`Commands: V4_SWAP`);
  }

  const swapData = encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, inputs, deadline],
  });

  const txValue = needsWrap ? amountWei : BigInt(0);

  console.log(`Sending swap to Universal Router...`);
  if (isNativeIn) {
    console.log(`  Sending ${formatEther(txValue)} ETH with transaction`);
  }

  try {
    const hash = await walletClient.sendTransaction({
      to: UNIVERSAL_ROUTER,
      data: swapData,
      value: txValue,
      gas: 500000n, // V4 gas estimation is unreliable — always override
    });

    console.log(`  TX: ${hash}`);
    console.log(`  Explorer: https://basescan.org/tx/${hash}`);
    console.log(`  Waiting for confirmation...`);

    const receipt = await pub.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`  Swap successful!`);

      // Check new balances
      if (isNativeOut) {
        const newBal = await pub.getBalance({ address: wallet.address });
        console.log(`\nNew ETH balance: ${formatEther(newBal)}`);
      } else {
        const newBalance = await pub.readContract({
          address: tokenOut.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [wallet.address],
        });
        console.log(`\nNew ${tokenOutSymbol} balance: ${formatUnits(newBalance, tokenOut.decimals)}`);
      }

      // Also show ETH balance change if we spent ETH
      if (isNativeIn) {
        const newEth = await pub.getBalance({ address: wallet.address });
        console.log(`Remaining ETH: ${formatEther(newEth)}`);
      }
    } else {
      console.log(`  Swap FAILED! Check transaction on basescan.`);
    }
  } catch (e: any) {
    console.error(`\nSwap error: ${e.message}`);
    if (e.message.includes('reverted')) {
      console.error('\nPossible causes:');
      console.error('  - Wrong hook for this pool');
      console.error('  - Wrong tick spacing (try --tick-spacing 60 or --tick-spacing 200)');
      console.error('  - Pool uses WETH not native ETH (try --tokenIn WETH)');
      console.error('  - Pool does not exist with these params');
    }
  }
}

main().catch(console.error);
