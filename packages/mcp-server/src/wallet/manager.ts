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
  // Core Ecosystem
  ARBME: getAddress("0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07"),
  RATCHET: getAddress("0x392bc5DeEa227043d69Af0e67BadCbBAeD511B07"),
  CHAOS: getAddress("0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292"),
  CHAOSLP: getAddress("0x8454d062506a27675706148ecdd194e45e44067a"),
  ALPHACLAW: getAddress("0x8C19A8b92FA406Ae097EB9eA8a4A44cBC10EafE2"),
  ABC: getAddress("0x5c0872b790Bb73e2B3A9778Db6E7704095624b07"),
  PAGE: getAddress("0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE"),
  FLAY: getAddress("0xf1a7000000950c7ad8aff13118bb7ab561a448ee"),
  VIRTUAL: getAddress("0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b"),
  // Connected Tokens
  CLANKER: getAddress("0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb"),
  BNKR: getAddress("0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b"),
  CNEWS: getAddress("0x01de044ad8eb037334ddda97a38bb0c798e4eb07"),
  // Base Assets
  USDC: getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  WETH: getAddress("0x4200000000000000000000000000000000000006"),
  FLETH: getAddress("0x000000000D564D5be76f7f0d28fE52605afC7Cf8"),
};

export const TOKEN_DECIMALS: Record<string, number> = {
  [TOKENS.USDC]: 6,
  [TOKENS.PAGE]: 8,
  // All others are 18 decimals — default in getTokenBalance fallback
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

  // ── Transaction methods ──────────────────────────────────────────────

  async sendTransaction(tx: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
  }): Promise<`0x${string}`> {
    return this.walletClient.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value ?? 0n,
    });
  }

  async writeContract(args: {
    address: Address;
    abi: any;
    functionName: string;
    args: any[];
  }): Promise<`0x${string}`> {
    return this.walletClient.writeContract(args as any);
  }

  async waitForReceipt(hash: `0x${string}`) {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }

  // ── Balance methods ────────────────────────────────────────────────

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
