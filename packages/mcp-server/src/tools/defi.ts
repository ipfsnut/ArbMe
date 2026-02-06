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
  encodeFunctionData,
  decodeFunctionResult,
  keccak256,
  type Address,
} from "viem";
import { getPublicClient, getWalletManager, TOKENS } from "../wallet/manager.js";

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
    50000: 1000,
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
  } catch {
    return false;
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
  const standardFees = fee ? [fee] : [3000, 10000, 500, 50000];
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
        const url = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${tokenAddr}/pools?page=1`;
        const response = await fetch(url);
        if (!response.ok) {
          return textErr(`GeckoTerminal API error: ${response.status}`);
        }

        const data = (await response.json()) as any;
        const pools: GeckoPool[] = [];

        for (const pool of data.data || []) {
          const attrs = pool.attributes;
          const tvl = parseFloat(attrs.reserve_in_usd) || null;

          if (minTvlVal > 0 && (tvl === null || tvl < minTvlVal)) continue;

          let version = "V2";
          const dexName = attrs.dex || "";
          if (dexName.includes("v4")) version = "V4";
          else if (dexName.includes("v3")) version = "V3";
          else if (dexName.includes("balancer")) version = "Balancer";

          const feeMatch = attrs.name?.match(/(\d+\.?\d*)%/);
          const fee = feeMatch ? feeMatch[1] + "%" : undefined;

          pools.push({
            name: attrs.name,
            address: attrs.address,
            dex: dexName,
            version,
            fee,
            tvl,
            priceUSD: parseFloat(attrs.base_token_price_usd) || 0,
            volume24h: parseFloat(attrs.volume_usd?.h24) || 0,
            priceChange24h: parseFloat(attrs.price_change_percentage?.h24) || 0,
          });
        }

        pools.sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
        const totalTvl = pools.reduce((sum, p) => sum + (p.tvl || 0), 0);

        return text(
          JSON.stringify(
            {
              token: tokenAddr,
              pools,
              totalPools: pools.length,
              totalTvl: Math.round(totalTvl * 100) / 100,
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
        const url = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${tokenAddr}/pools?page=1`;
        const response = await fetch(url);
        if (!response.ok) {
          return textErr(`GeckoTerminal API error: ${response.status}`);
        }

        const data = (await response.json()) as any;

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
        for (const pool of data.data || []) {
          const attrs = pool.attributes;
          const price = parseFloat(attrs.base_token_price_usd);
          if (!price || price <= 0) continue;

          let version = "V2";
          const dexName = attrs.dex || "";
          if (dexName.includes("v4")) version = "V4";
          else if (dexName.includes("v3")) version = "V3";
          else if (dexName.includes("balancer")) version = "Balancer";

          pools.push({
            name: attrs.name,
            address: attrs.address,
            dex: dexName,
            version,
            tvl: parseFloat(attrs.reserve_in_usd) || null,
            priceUSD: price,
            volume24h: parseFloat(attrs.volume_usd?.h24) || 0,
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
}
