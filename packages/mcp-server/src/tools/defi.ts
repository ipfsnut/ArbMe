/**
 * DeFi tools — arbme_get_pools, arbme_get_quote, arbme_check_balances, arbme_find_arb
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../lib/config.js";
import {
  getAddress,
  parseUnits,
  formatUnits,
  encodeAbiParameters,
  parseAbiParameters,
  parseAbi,
  encodeFunctionData,
  encodePacked,
  decodeFunctionResult,
  keccak256,
  type Address,
} from "viem";
import { getPublicClient, getWalletManager, TOKENS, TOKEN_DECIMALS } from "../wallet/manager.js";
import { fetchPoolsForToken, type PoolData } from "@arbme/core-lib";

// ── Helpers ──────────────────────────────────────────────────────────
function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function textErr(t: string) {
  return { content: [{ type: "text" as const, text: t }], isError: true as const };
}

// ── V4 / V3 constants ────────────────────────────────────────────────
const V4_QUOTER = getAddress("0x0d5e0f971ed27fbff6c2837bf31316121532048d");
const V4_STATE_VIEW = getAddress("0xa3c0c9b65bad0b08107aa264b0f3db444b867a71");
const V3_QUOTER = getAddress("0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a");

const CLANKER_HOOK_V2 = getAddress("0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC");
const CLANKER_HOOK_V1 = getAddress("0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC");
const NO_HOOK = "0x0000000000000000000000000000000000000000" as Address;

const CLANKER_FEE = 8388608; // 0x800000 — dynamic fee flag
const CLANKER_TICK_SPACING = 200;

// ── Swap infrastructure ─────────────────────────────────────────────
const UNIVERSAL_ROUTER = getAddress("0x6ff5693b99212da76ad316178a184ab56d299b43");
const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");

// ── Safety guards ───────────────────────────────────────────────────
const MAX_SWAP_AMOUNT_WEI = parseUnits("10000000", 18); // 10M tokens max per swap
const DEFAULT_SLIPPAGE_BPS = 500; // 5%
const MAX_SLIPPAGE_BPS = 2000; // 20%

// ── Approval ABIs ───────────────────────────────────────────────────
const erc20ApprovalAbi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const permit2Abi = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

const universalRouterAbi = [
  {
    name: "execute",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// ── Corrected V4 Quoter ABI ─────────────────────────────────────────
// The actual V4 Quoter returns (uint256 amountOut, uint256 gasEstimate),
// NOT the V3 QuoterV2 pattern of (int128[], uint160[], uint32[]).
const quoterV4Abi = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const quoterV3Abi = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const stateViewAbi = [
  {
    name: "getSlot0",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

// ── Pool discovery helpers ───────────────────────────────────────────
function getTickSpacing(fee: number): number {
  const spacings: Record<number, number> = {
    100: 1,
    500: 10,
    3000: 60,
    10000: 200,
    25000: 500,
    30000: 600,
    50000: 1000,
    100000: 2000,
    8388608: 200,
  };
  return spacings[fee] || 60;
}

interface PoolConfig {
  fee: number;
  tickSpacing: number;
  hooks: Address;
  name: string;
}

function computePoolId(
  currency0: Address,
  currency1: Address,
  fee: number,
  tickSpacing: number,
  hooks: Address,
): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters("address, address, uint24, int24, address"),
    [currency0, currency1, fee, tickSpacing, hooks],
  );
  return keccak256(encoded);
}

async function poolExists(
  client: any,
  token0: Address,
  token1: Address,
  fee: number,
  tickSpacing: number,
  hooks: Address,
): Promise<boolean> {
  const poolId = computePoolId(token0, token1, fee, tickSpacing, hooks);
  try {
    const result = await client.readContract({
      address: V4_STATE_VIEW,
      abi: stateViewAbi,
      functionName: "getSlot0",
      args: [poolId],
    });
    return result[0] > 0n;
  } catch (err: unknown) {
    // Contract revert = pool doesn't exist. Network/RPC errors should propagate.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("revert") || msg.includes("execution reverted") || msg.includes("call exception")) {
      return false;
    }
    throw err;
  }
}

function getPoolConfigs(fee?: number, tickSpacing?: number, hooks?: Address): PoolConfig[] {
  const configs: PoolConfig[] = [];

  // If explicit params provided, try that first
  if (fee && tickSpacing && hooks) {
    configs.push({ fee, tickSpacing, hooks, name: "explicit" });
  }

  // Clanker V2 hooked pool (most common for newer tokens)
  configs.push({
    fee: CLANKER_FEE,
    tickSpacing: CLANKER_TICK_SPACING,
    hooks: CLANKER_HOOK_V2,
    name: "clanker-v2",
  });

  // Clanker V1 hooked pool (older tokens)
  configs.push({
    fee: CLANKER_FEE,
    tickSpacing: CLANKER_TICK_SPACING,
    hooks: CLANKER_HOOK_V1,
    name: "clanker-v1",
  });

  // Standard hookless pools
  const standardFees = fee ? [fee] : [3000, 10000, 500, 30000, 50000, 25000, 100000];
  for (const f of standardFees) {
    configs.push({
      fee: f,
      tickSpacing: tickSpacing || getTickSpacing(f),
      hooks: NO_HOOK,
      name: `v4-${f / 10000}%`,
    });
  }

  return configs;
}

// ── GeckoTerminal pool types ─────────────────────────────────────────
interface GeckoPool {
  name: string;
  address: string;
  dex: string;
  version: string;
  fee?: string;
  tvl: number | null;
  priceUSD: number;
  volume24h: number;
  priceChange24h: number;
}

const DEFAULT_TOKEN = "0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07"; // ARBME

// ── Registration ─────────────────────────────────────────────────────
export function registerDefiTools(server: McpServer, config: ServerConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tool = server.tool.bind(server) as any;

  // ━━ arbme_get_pools ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  tool(
    "arbme_get_pools",
    "Fetch all pools for a token with current prices, TVL, and volume from GeckoTerminal.",
    {
      token: z.string().optional().describe("Token address (default: ARBME)"),
      minTvl: z.number().optional().describe("Minimum TVL filter in USD (default: 0)"),
    },
    async ({ token, minTvl }: { token?: string; minTvl?: number }) => {
      const tokenAddr = token || DEFAULT_TOKEN;
      const minTvlVal = minTvl || 0;

      try {
        const result = await fetchPoolsForToken(tokenAddr, config.alchemyKey ?? undefined);
        const pools: GeckoPool[] = [];

        for (const pool of result.pools) {
          if (minTvlVal > 0 && pool.tvl < minTvlVal) continue;

          let version = "V2";
          if (pool.dex.includes("V4")) version = "V4";
          else if (pool.dex.includes("V3")) version = "V3";
          else if (pool.dex.includes("Balancer")) version = "Balancer";

          pools.push({
            name: pool.pair,
            address: pool.pairAddress,
            dex: pool.dex,
            version,
            fee: pool.fee ? `${pool.fee / 10000}%` : undefined,
            tvl: pool.tvl,
            priceUSD: parseFloat(pool.priceUsd) || 0,
            volume24h: pool.volume24h,
            priceChange24h: pool.priceChange24h,
          });
        }

        return text(
          JSON.stringify(
            {
              token: tokenAddr,
              pools,
              totalPools: pools.length,
              totalTvl: Math.round(result.tvl * 100) / 100,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
      } catch (error: any) {
        return textErr(`get_pools error: ${error.message}`);
      }
    },
  );

  // ━━ arbme_get_quote ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  tool(
    "arbme_get_quote",
    "Get a swap quote with expected output and price impact. Supports V3, V4, and V4 hooked (Clanker) pools on Base.",
    {
      tokenIn: z.string().describe("Input token address"),
      tokenOut: z.string().describe("Output token address"),
      amountIn: z.string().describe('Amount in human-readable form (e.g. "1.5")'),
      decimalsIn: z.number().optional().describe("Decimals for input token (default: 18)"),
      decimalsOut: z.number().optional().describe("Decimals for output token (default: 18)"),
      fee: z.number().optional().describe("Fee tier (e.g. 500, 3000, 10000)"),
      tickSpacing: z.number().optional().describe("Tick spacing (auto-detected from fee)"),
      hooks: z.string().optional().describe("Hook address for V4 hooked pools"),
      version: z.enum(["V3", "V4"]).optional().describe("Uniswap version (default: V4)"),
    },
    async ({
      tokenIn: tokenInRaw,
      tokenOut: tokenOutRaw,
      amountIn,
      decimalsIn,
      decimalsOut,
      fee,
      tickSpacing,
      hooks,
      version,
    }: {
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      decimalsIn?: number;
      decimalsOut?: number;
      fee?: number;
      tickSpacing?: number;
      hooks?: string;
      version?: string;
    }) => {
      try {
        const client = getPublicClient(config);
        const tokenIn = getAddress(tokenInRaw);
        const tokenOut = getAddress(tokenOutRaw);
        const decIn = decimalsIn ?? 18;
        const decOut = decimalsOut ?? 18;
        const ver = version || "V4";
        const amountInRaw = parseUnits(amountIn, decIn);

        let amountOut: bigint;
        let usedConfig: PoolConfig | null = null;

        if (ver === "V3") {
          const feeTier = fee || 3000;
          const result = await client.simulateContract({
            address: V3_QUOTER,
            abi: quoterV3Abi,
            functionName: "quoteExactInputSingle",
            args: [
              {
                tokenIn,
                tokenOut,
                amountIn: amountInRaw,
                fee: feeTier,
                sqrtPriceLimitX96: 0n,
              },
            ],
          });
          amountOut = result.result[0] as bigint;
          usedConfig = { fee: feeTier, tickSpacing: 0, hooks: NO_HOOK, name: "v3" };
        } else {
          // V4 — sort tokens for pool key
          const token0 = tokenIn < tokenOut ? tokenIn : tokenOut;
          const token1 = tokenIn < tokenOut ? tokenOut : tokenIn;
          const zeroForOne = tokenIn === token0;

          const configs = getPoolConfigs(
            fee,
            tickSpacing,
            hooks ? getAddress(hooks) : undefined,
          );

          let lastError = "";

          for (const cfg of configs) {
            const exists = await poolExists(
              client,
              token0,
              token1,
              cfg.fee,
              cfg.tickSpacing,
              cfg.hooks,
            );
            if (!exists) {
              lastError = `Pool not found: ${cfg.name}`;
              continue;
            }

            try {
              const calldata = encodeFunctionData({
                abi: quoterV4Abi,
                functionName: "quoteExactInputSingle",
                args: [
                  {
                    poolKey: {
                      currency0: token0,
                      currency1: token1,
                      fee: cfg.fee,
                      tickSpacing: cfg.tickSpacing,
                      hooks: cfg.hooks,
                    },
                    zeroForOne,
                    exactAmount: amountInRaw,
                    hookData: "0x" as `0x${string}`,
                  },
                ],
              });

              const result = await client.call({
                to: V4_QUOTER,
                data: calldata,
              });

              if (!result.data || result.data.length < 66) {
                lastError = `Empty or short response for ${cfg.name}`;
                continue;
              }

              // Proper decoding using decodeFunctionResult
              const decoded = decodeFunctionResult({
                abi: quoterV4Abi,
                functionName: "quoteExactInputSingle",
                data: result.data,
              });

              amountOut = decoded[0];
              usedConfig = cfg;
              break;
            } catch (e: any) {
              lastError = e.shortMessage || e.message || "Quote failed";
              continue;
            }
          }

          if (!usedConfig) {
            return textErr(
              JSON.stringify({
                error: `No valid pool found. Last error: ${lastError}`,
                hint: "Tried Clanker V2/V1 hooked pools and standard V4 pools. Pool may not exist for this pair.",
              }),
            );
          }
        }

        const amountOutFormatted = formatUnits(amountOut!, decOut);
        const amountInNum = parseFloat(amountIn);
        const amountOutNum = parseFloat(amountOutFormatted);
        const executionPrice = amountInNum > 0 ? amountOutNum / amountInNum : 0;

        let feeDisplay: string;
        if (usedConfig!.fee === CLANKER_FEE) {
          feeDisplay = "dynamic (clanker)";
        } else {
          feeDisplay = `${usedConfig!.fee / 10000}%`;
        }

        return text(
          JSON.stringify(
            {
              tokenIn,
              tokenOut,
              amountIn,
              amountOut: amountOutFormatted,
              amountOutRaw: amountOut!.toString(),
              executionPrice,
              pool: {
                type: usedConfig!.name,
                fee: feeDisplay,
                tickSpacing: usedConfig!.tickSpacing,
                hooks: usedConfig!.hooks === NO_HOOK ? null : usedConfig!.hooks,
              },
              version: ver,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
      } catch (error: any) {
        return textErr(
          JSON.stringify({
            error: error.message,
            hint: "Check token addresses and ensure the pair has on-chain liquidity.",
          }),
        );
      }
    },
  );

  // ━━ arbme_check_balances ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  tool(
    "arbme_check_balances",
    "Check wallet ETH and token balances on Base. Uses configured hot wallet by default.",
    {
      wallet: z.string().optional().describe("Wallet address to check (default: configured hot wallet)"),
      tokens: z
        .array(z.string())
        .optional()
        .describe("Token addresses to check (default: common ecosystem tokens)"),
    },
    async ({ wallet, tokens }: { wallet?: string; tokens?: string[] }) => {
      try {
        const manager = getWalletManager(config);
        const address = wallet ? getAddress(wallet) : manager.address;

        const tokenAddresses: Address[] = tokens
          ? tokens.map((t) => getAddress(t))
          : Object.values(TOKENS);

        const result = await manager.getAllBalances(address, tokenAddresses);

        return text(
          JSON.stringify(
            {
              wallet: address,
              eth: result.eth,
              tokens: result.tokens,
              totalTokens: result.tokens.length,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
      } catch (error: any) {
        return textErr(`check_balances error: ${error.message}`);
      }
    },
  );

  // ━━ arbme_find_arb ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  tool(
    "arbme_find_arb",
    "Analyze pools for arbitrage opportunities between different venues using GeckoTerminal pricing.",
    {
      token: z.string().optional().describe("Token address to analyze (default: ARBME)"),
      minSpread: z.number().optional().describe("Minimum spread % to report (default: 1)"),
      tradeSizeUSD: z.number().optional().describe("Trade size in USD to simulate (default: 5)"),
    },
    async ({
      token,
      minSpread,
      tradeSizeUSD,
    }: {
      token?: string;
      minSpread?: number;
      tradeSizeUSD?: number;
    }) => {
      const tokenAddr = token || DEFAULT_TOKEN;
      const minSpreadVal = minSpread ?? 1;
      const tradeSize = tradeSizeUSD ?? 5;
      const GAS_COST_USD = 0.02;

      try {
        const result = await fetchPoolsForToken(tokenAddr, config.alchemyKey ?? undefined);

        interface ArbPool {
          name: string;
          address: string;
          dex: string;
          version: string;
          tvl: number | null;
          priceUSD: number;
          volume24h: number;
        }

        const pools: ArbPool[] = [];
        for (const pool of result.pools) {
          const price = parseFloat(pool.priceUsd);
          if (!price || price <= 0) continue;

          let version = "V2";
          if (pool.dex.includes("V4")) version = "V4";
          else if (pool.dex.includes("V3")) version = "V3";
          else if (pool.dex.includes("Balancer")) version = "Balancer";

          pools.push({
            name: pool.pair,
            address: pool.pairAddress,
            dex: pool.dex,
            version,
            tvl: pool.tvl,
            priceUSD: price,
            volume24h: pool.volume24h,
          });
        }

        pools.sort((a, b) => a.priceUSD - b.priceUSD);

        interface ArbOpportunity {
          buyPool: string;
          sellPool: string;
          buyPoolAddress: string;
          sellPoolAddress: string;
          buyVersion: string;
          sellVersion: string;
          buyPrice: number;
          sellPrice: number;
          spreadPercent: number;
          estimatedGrossProfit: number;
          estimatedGas: number;
          estimatedNetProfit: number;
          profitable: boolean;
        }

        const opportunities: ArbOpportunity[] = [];

        for (let i = 0; i < pools.length; i++) {
          for (let j = i + 1; j < pools.length; j++) {
            const buyPool = pools[i];
            const sellPool = pools[j];
            const spreadPercent =
              ((sellPool.priceUSD - buyPool.priceUSD) / buyPool.priceUSD) * 100;

            if (spreadPercent < minSpreadVal) continue;
            if (
              (buyPool.tvl && buyPool.tvl < 50) ||
              (sellPool.tvl && sellPool.tvl < 50)
            )
              continue;

            const grossProfit = (tradeSize * spreadPercent) / 100;
            const estimatedGas = GAS_COST_USD * 2;
            const netProfit = grossProfit - estimatedGas;

            opportunities.push({
              buyPool: buyPool.name,
              sellPool: sellPool.name,
              buyPoolAddress: buyPool.address,
              sellPoolAddress: sellPool.address,
              buyVersion: buyPool.version,
              sellVersion: sellPool.version,
              buyPrice: buyPool.priceUSD,
              sellPrice: sellPool.priceUSD,
              spreadPercent: Math.round(spreadPercent * 100) / 100,
              estimatedGrossProfit: Math.round(grossProfit * 1000) / 1000,
              estimatedGas,
              estimatedNetProfit: Math.round(netProfit * 1000) / 1000,
              profitable: netProfit > 0,
            });
          }
        }

        opportunities.sort((a, b) => b.spreadPercent - a.spreadPercent);
        const profitableOpps = opportunities.filter((o) => o.profitable);

        return text(
          JSON.stringify(
            {
              token: tokenAddr,
              poolsAnalyzed: pools.length,
              priceRange: {
                min: pools.length > 0 ? pools[0].priceUSD : 0,
                max: pools.length > 0 ? pools[pools.length - 1].priceUSD : 0,
              },
              tradeSizeUSD: tradeSize,
              opportunities: opportunities.slice(0, 10),
              profitableCount: profitableOpps.length,
              bestOpportunity: profitableOpps.length > 0 ? profitableOpps[0] : null,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
      } catch (error: any) {
        return textErr(`find_arb error: ${error.message}`);
      }
    },
  );

  // ━━ arbme_check_approval ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  tool(
    "arbme_check_approval",
    "Check if token approvals are in place for V4 swaps. V4 requires two approvals: ERC20→Permit2, then Permit2→UniversalRouter.",
    {
      token: z.string().describe("Token address to check approvals for"),
      amount: z.string().describe('Amount in human-readable form (e.g. "1000")'),
      decimals: z.number().optional().describe("Token decimals (default: 18)"),
    },
    async ({ token: tokenRaw, amount, decimals: dec }: { token: string; amount: string; decimals?: number }) => {
      try {
        const manager = getWalletManager(config);
        const client = getPublicClient(config);
        const token = getAddress(tokenRaw);
        const decimals = dec ?? TOKEN_DECIMALS[token] ?? 18;
        const amountWei = parseUnits(amount, decimals);

        // Check ERC20 → Permit2 allowance
        const erc20Allowance = await client.readContract({
          address: token,
          abi: erc20ApprovalAbi,
          functionName: "allowance",
          args: [manager.address, PERMIT2],
        });

        // Check Permit2 → Universal Router allowance
        const [permit2Amount, permit2Expiration] = await client.readContract({
          address: PERMIT2,
          abi: permit2Abi,
          functionName: "allowance",
          args: [manager.address, token, UNIVERSAL_ROUTER],
        }) as [bigint, bigint, bigint];

        const now = BigInt(Math.floor(Date.now() / 1000));
        const permit2Expired = permit2Expiration > 0n && permit2Expiration < now;
        const needsErc20Approval = erc20Allowance < amountWei;
        const needsPermit2Approval = permit2Amount < amountWei || permit2Expired;

        return text(
          JSON.stringify(
            {
              wallet: manager.address,
              token,
              amount,
              amountWei: amountWei.toString(),
              approvals: {
                erc20ToPermit2: {
                  current: formatUnits(erc20Allowance, decimals),
                  sufficient: !needsErc20Approval,
                },
                permit2ToRouter: {
                  current: formatUnits(permit2Amount, decimals),
                  expired: permit2Expired,
                  sufficient: !needsPermit2Approval,
                },
              },
              needsApproval: needsErc20Approval || needsPermit2Approval,
              steps: [
                ...(needsErc20Approval ? ["Call arbme_approve_token with step='erc20-to-permit2'"] : []),
                ...(needsPermit2Approval ? ["Call arbme_approve_token with step='permit2-to-router'"] : []),
              ],
            },
            null,
            2,
          ),
        );
      } catch (error: any) {
        return textErr(`check_approval error: ${error.message}`);
      }
    },
  );

  // ━━ arbme_approve_token ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  tool(
    "arbme_approve_token",
    "Execute a token approval for V4 swaps. Two steps: 'erc20-to-permit2' (ERC20 approve) then 'permit2-to-router' (Permit2 approve to Universal Router).",
    {
      token: z.string().describe("Token address to approve"),
      step: z
        .enum(["erc20-to-permit2", "permit2-to-router"])
        .describe("Which approval step to execute"),
      amount: z.string().optional().describe("Amount to approve in wei. Defaults to unlimited if not specified."),
    },
    async ({ token: tokenRaw, step, amount }: { token: string; step: string; amount?: string }) => {
      try {
        const manager = getWalletManager(config);
        const token = getAddress(tokenRaw);
        const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        const MAX_UINT160 = BigInt("0x" + "f".repeat(40));

        let txHash: `0x${string}`;

        if (step === "erc20-to-permit2") {
          // Check if token already has Permit2 hardcoded (Clanker/Flaunch tokens)
          const client = getPublicClient(config);
          const currentAllowance = await client.readContract({
            address: token,
            abi: erc20ApprovalAbi as any,
            functionName: "allowance",
            args: [manager.address, PERMIT2],
          }) as bigint;
          const approvalAmount = amount ? BigInt(amount) : MAX_UINT256;

          if (currentAllowance >= approvalAmount) {
            return text(JSON.stringify({
              success: true,
              skipped: true,
              reason: "ERC20→Permit2 allowance already sufficient (token may have hardcoded Permit2 support)",
              currentAllowance: currentAllowance.toString(),
            }, null, 2));
          }

          txHash = await manager.writeContract({
            address: token,
            abi: erc20ApprovalAbi as any,
            functionName: "approve",
            args: [PERMIT2, approvalAmount],
          });
        } else {
          const approvalAmount = amount ? BigInt(amount) : MAX_UINT160;
          const expiration = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days
          txHash = await manager.writeContract({
            address: PERMIT2,
            abi: permit2Abi as any,
            functionName: "approve",
            args: [token, UNIVERSAL_ROUTER, approvalAmount, expiration],
          });
        }

        const receipt = await manager.waitForReceipt(txHash);

        return text(
          JSON.stringify(
            {
              success: receipt.status === "success",
              step,
              token,
              txHash,
              gasUsed: receipt.gasUsed.toString(),
              blockNumber: receipt.blockNumber.toString(),
            },
            null,
            2,
          ),
        );
      } catch (error: any) {
        return textErr(`approve_token error: ${error.message}`);
      }
    },
  );

  // ━━ arbme_execute_swap ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  tool(
    "arbme_execute_swap",
    "Execute a V4 swap on Base. Auto-detects pool config (Clanker hooked or hookless). Default is dry-run mode — set dryRun=false to execute.",
    {
      tokenIn: z.string().describe("Input token address"),
      tokenOut: z.string().describe("Output token address"),
      amountIn: z.string().describe('Amount in human-readable form (e.g. "1000")'),
      decimalsIn: z.number().optional().describe("Input token decimals (default: 18)"),
      decimalsOut: z.number().optional().describe("Output token decimals (default: 18)"),
      slippageBps: z.number().optional().describe("Slippage tolerance in basis points (default: 500 = 5%, max: 2000)"),
      dryRun: z.boolean().optional().describe("If true (default), return quote + tx data without executing"),
      fee: z.number().optional().describe("Fee tier override"),
      tickSpacing: z.number().optional().describe("Tick spacing override"),
      hooks: z.string().optional().describe("Hook address override"),
    },
    async ({
      tokenIn: tokenInRaw,
      tokenOut: tokenOutRaw,
      amountIn,
      decimalsIn,
      decimalsOut,
      slippageBps,
      dryRun,
      fee,
      tickSpacing,
      hooks,
    }: {
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      decimalsIn?: number;
      decimalsOut?: number;
      slippageBps?: number;
      dryRun?: boolean;
      fee?: number;
      tickSpacing?: number;
      hooks?: string;
    }) => {
      try {
        const isDryRun = dryRun !== false; // default true
        const slippage = Math.min(slippageBps ?? DEFAULT_SLIPPAGE_BPS, MAX_SLIPPAGE_BPS);
        const manager = getWalletManager(config);
        const client = getPublicClient(config);
        const tokenIn = getAddress(tokenInRaw);
        const tokenOut = getAddress(tokenOutRaw);
        const decIn = decimalsIn ?? TOKEN_DECIMALS[tokenIn] ?? 18;
        const decOut = decimalsOut ?? TOKEN_DECIMALS[tokenOut] ?? 18;
        const amountInWei = parseUnits(amountIn, decIn);

        // ── Safety check: max amount ──
        if (amountInWei > MAX_SWAP_AMOUNT_WEI) {
          return textErr(
            JSON.stringify({
              error: "Amount exceeds safety limit",
              maxAmount: formatUnits(MAX_SWAP_AMOUNT_WEI, decIn),
              requestedAmount: amountIn,
            }),
          );
        }

        // ── Sort tokens for pool key ──
        const token0 = tokenIn < tokenOut ? tokenIn : tokenOut;
        const token1 = tokenIn < tokenOut ? tokenOut : tokenIn;
        const zeroForOne = tokenIn === token0;

        // ── Auto-detect pool ──
        const configs = getPoolConfigs(
          fee,
          tickSpacing,
          hooks ? getAddress(hooks) : undefined,
        );

        let usedConfig: PoolConfig | null = null;
        let quotedAmountOut: bigint = 0n;

        for (const cfg of configs) {
          const exists = await poolExists(client, token0, token1, cfg.fee, cfg.tickSpacing, cfg.hooks);
          if (!exists) continue;

          try {
            const calldata = encodeFunctionData({
              abi: quoterV4Abi,
              functionName: "quoteExactInputSingle",
              args: [
                {
                  poolKey: {
                    currency0: token0,
                    currency1: token1,
                    fee: cfg.fee,
                    tickSpacing: cfg.tickSpacing,
                    hooks: cfg.hooks,
                  },
                  zeroForOne,
                  exactAmount: amountInWei,
                  hookData: "0x" as `0x${string}`,
                },
              ],
            });

            const result = await client.call({ to: V4_QUOTER, data: calldata });
            if (!result.data || result.data.length < 66) continue;

            const decoded = decodeFunctionResult({
              abi: quoterV4Abi,
              functionName: "quoteExactInputSingle",
              data: result.data,
            });

            quotedAmountOut = decoded[0];
            usedConfig = cfg;
            break;
          } catch {
            continue;
          }
        }

        if (!usedConfig || quotedAmountOut === 0n) {
          return textErr(
            JSON.stringify({
              error: "No valid pool found for this pair",
              hint: "Tried Clanker V2/V1 hooked pools and standard V4 pools.",
            }),
          );
        }

        // ── Calculate min amount out with slippage ──
        const minAmountOut = (quotedAmountOut * BigInt(10000 - slippage)) / 10000n;

        // ── Build V4 swap transaction ──
        // Actions: SWAP_EXACT_IN_SINGLE(0x06) + SETTLE_ALL(0x0c) + TAKE_ALL(0x0f)
        const actions = encodePacked(
          ["uint8", "uint8", "uint8"],
          [0x06, 0x0c, 0x0f],
        );

        const swapParam = encodeAbiParameters(
          [
            {
              type: "tuple",
              components: [
                {
                  type: "tuple",
                  name: "poolKey",
                  components: [
                    { name: "currency0", type: "address" },
                    { name: "currency1", type: "address" },
                    { name: "fee", type: "uint24" },
                    { name: "tickSpacing", type: "int24" },
                    { name: "hooks", type: "address" },
                  ],
                },
                { name: "zeroForOne", type: "bool" },
                { name: "amountIn", type: "uint128" },
                { name: "amountOutMinimum", type: "uint128" },
                { name: "hookData", type: "bytes" },
              ],
            },
          ],
          [
            {
              poolKey: {
                currency0: token0,
                currency1: token1,
                fee: usedConfig.fee,
                tickSpacing: usedConfig.tickSpacing,
                hooks: usedConfig.hooks,
              },
              zeroForOne,
              amountIn: amountInWei,
              amountOutMinimum: minAmountOut,
              hookData: "0x" as `0x${string}`,
            },
          ],
        );

        const currencyIn = zeroForOne ? token0 : token1;
        const currencyOut = zeroForOne ? token1 : token0;

        const settleParam = encodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }],
          [currencyIn, amountInWei],
        );

        const takeParam = encodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }],
          [currencyOut, minAmountOut],
        );

        const v4SwapInput = encodeAbiParameters(
          [{ type: "bytes" }, { type: "bytes[]" }],
          [actions, [swapParam, settleParam, takeParam]],
        );

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

        const txData = encodeFunctionData({
          abi: universalRouterAbi,
          functionName: "execute",
          args: ["0x10" as `0x${string}`, [v4SwapInput], deadline],
        });

        const quoteInfo = {
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: formatUnits(quotedAmountOut, decOut),
          minAmountOut: formatUnits(minAmountOut, decOut),
          slippageBps: slippage,
          pool: {
            type: usedConfig.name,
            fee: usedConfig.fee === CLANKER_FEE ? "dynamic (clanker)" : `${usedConfig.fee / 10000}%`,
            tickSpacing: usedConfig.tickSpacing,
            hooks: usedConfig.hooks === NO_HOOK ? null : usedConfig.hooks,
          },
        };

        // ── Dry run: return quote + tx data ──
        if (isDryRun) {
          return text(
            JSON.stringify(
              {
                dryRun: true,
                quote: quoteInfo,
                transaction: {
                  to: UNIVERSAL_ROUTER,
                  data: txData,
                  value: "0",
                },
                hint: "Set dryRun=false to execute. Ensure approvals are in place first (use arbme_check_approval).",
              },
              null,
              2,
            ),
          );
        }

        // ── Live execution ──
        // Check approvals first
        const erc20Allowance = await client.readContract({
          address: tokenIn,
          abi: erc20ApprovalAbi,
          functionName: "allowance",
          args: [manager.address, PERMIT2],
        });

        if (erc20Allowance < amountInWei) {
          return textErr(
            JSON.stringify({
              error: "Insufficient ERC20→Permit2 allowance",
              hint: "Run arbme_approve_token with step='erc20-to-permit2' first.",
              current: formatUnits(erc20Allowance, decIn),
              needed: amountIn,
            }),
          );
        }

        const [permit2Amount] = await client.readContract({
          address: PERMIT2,
          abi: permit2Abi,
          functionName: "allowance",
          args: [manager.address, tokenIn, UNIVERSAL_ROUTER],
        }) as [bigint, number, number];

        if (permit2Amount < amountInWei) {
          return textErr(
            JSON.stringify({
              error: "Insufficient Permit2→Router allowance",
              hint: "Run arbme_approve_token with step='permit2-to-router' first.",
              current: formatUnits(permit2Amount, decIn),
              needed: amountIn,
            }),
          );
        }

        // Execute
        const txHash = await manager.sendTransaction({
          to: UNIVERSAL_ROUTER,
          data: txData,
          value: 0n,
        });

        const receipt = await manager.waitForReceipt(txHash);

        return text(
          JSON.stringify(
            {
              success: receipt.status === "success",
              quote: quoteInfo,
              txHash,
              gasUsed: receipt.gasUsed.toString(),
              blockNumber: receipt.blockNumber.toString(),
              basescanUrl: `https://basescan.org/tx/${txHash}`,
            },
            null,
            2,
          ),
        );
      } catch (error: any) {
        return textErr(`execute_swap error: ${error.message}`);
      }
    },
  );
}
