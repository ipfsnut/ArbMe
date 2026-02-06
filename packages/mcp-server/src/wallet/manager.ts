/**
 * Wallet Manager — viem public/wallet clients, token map, balance reads
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  formatUnits,
  parseAbi,
  getAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { ServerConfig } from "../lib/config.js";

// ── Known tokens on Base ──────────────────────────────────────────────
export const TOKENS: Record<string, Address> = {
  WETH: getAddress("0x4200000000000000000000000000000000000006"),
  USDC: getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  ARBME: getAddress("0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07"),
  CHAOS: getAddress("0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292"),
  ALPHACLAW: getAddress("0x8C19A8b92FA406Ae097EB9eA8a4A44cBC10EafE2"),
  RATCHET: getAddress("0x80c1b7F0988d27F8Cd68E2a2DCE0EA7D0FaE6bf3"),
};

export const TOKEN_DECIMALS: Record<string, number> = {
  [TOKENS.WETH]: 18,
  [TOKENS.USDC]: 6,
  [TOKENS.ARBME]: 18,
  [TOKENS.CHAOS]: 18,
  [TOKENS.ALPHACLAW]: 18,
  [TOKENS.RATCHET]: 18,
};

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

// ── Lazy singletons ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _publicClient: any = null;
let _walletManager: WalletManager | null = null;

export function getPublicClient(config: ServerConfig) {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: base,
      transport: http(config.baseRpcUrl),
    });
  }
  return _publicClient!;
}

export function getWalletManager(config: ServerConfig): WalletManager {
  if (!_walletManager) {
    if (!config.arbmePrivateKey) {
      throw new Error(
        "ARBME_PRIVATE_KEY env var is required for wallet operations. Set it and restart the server.",
      );
    }
    _walletManager = new WalletManager(config);
  }
  return _walletManager;
}

// ── WalletManager class ───────────────────────────────────────────────
export class WalletManager {
  private account;
  private publicClient;
  private walletClient;

  constructor(config: ServerConfig) {
    const key = config.arbmePrivateKey;
    if (!key) {
      throw new Error("No private key provided.");
    }
    const hex = key.startsWith("0x") ? key : `0x${key}`;
    this.account = privateKeyToAccount(hex as `0x${string}`);
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(config.baseRpcUrl),
    });
    this.walletClient = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(config.baseRpcUrl),
    });
  }

  get address(): Address {
    return this.account.address;
  }

  get client() {
    return this.publicClient;
  }

  async getEthBalance(addr?: Address): Promise<{ balance: bigint; formatted: string }> {
    const target = addr ?? this.address;
    const balance = await this.publicClient.getBalance({ address: target });
    return { balance, formatted: formatEther(balance) };
  }

  async getTokenBalance(
    tokenAddress: Address,
    addr?: Address,
  ): Promise<{ balance: bigint; formatted: string; decimals: number; symbol: string }> {
    const target = addr ?? this.address;
    const [balance, decimals, symbol] = await Promise.all([
      this.publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [target],
      }),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
      }),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "symbol",
      }),
    ]);

    return {
      balance,
      formatted: formatUnits(balance, decimals),
      decimals,
      symbol,
    };
  }

  async getAllBalances(
    addr?: Address,
    tokens: Address[] = Object.values(TOKENS),
  ): Promise<{
    eth: { balance: string };
    tokens: Array<{ address: Address; symbol: string; balance: string; balanceRaw: string }>;
  }> {
    const target = addr ?? this.address;
    const ethBal = await this.getEthBalance(target);
    const tokenBalances = await Promise.all(
      tokens.map(async (tokenAddr) => {
        try {
          const bal = await this.getTokenBalance(tokenAddr, target);
          return {
            address: tokenAddr,
            symbol: bal.symbol,
            balance: bal.formatted,
            balanceRaw: bal.balance.toString(),
          };
        } catch {
          return { address: tokenAddr, symbol: "UNKNOWN", balance: "0", balanceRaw: "0" };
        }
      }),
    );

    return {
      eth: { balance: ethBal.formatted },
      tokens: tokenBalances.filter((t) => t.balanceRaw !== "0"),
    };
  }
}
