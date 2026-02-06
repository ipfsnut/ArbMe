import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

// ── Constants ──────────────────────────────────────────────────────────
export const CN_BASE_URL = "https://news.clanker.ai";
export const CHAIN_ID = 8453; // Base Mainnet
export const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
export const AGENT_ID = 1285n;
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// ── Server Config (loaded from env) ───────────────────────────────────
export interface ServerConfig {
  /** ERC-8004 agent private key (hex, with 0x prefix) */
  agentKey: PrivateKeyAccount | null;
  /** Neynar API key for Farcaster */
  neynarApiKey: string | null;
  /** Neynar managed signer UUID */
  neynarSignerUuid: string | null;
  /** Farcaster FID for notifications */
  neynarFid: string | null;
  /** Max posts to crosspost per run */
  maxCrosspost: number;
  /** Farcaster channel ID for crosspost */
  channelId: string | null;
  /** Base RPC URL for on-chain reads */
  baseRpcUrl: string;
  /** Private key for DeFi wallet (hex, with 0x prefix) */
  arbmePrivateKey: string | null;
}

export function loadConfig(): ServerConfig {
  let agentKey: PrivateKeyAccount | null = null;
  const rawKey = process.env.CN_AGENT_PRIVATE_KEY;
  if (rawKey) {
    const hex = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
    agentKey = privateKeyToAccount(hex as `0x${string}`);
  }

  return {
    agentKey,
    neynarApiKey: process.env.NEYNAR_API_KEY || null,
    neynarSignerUuid: process.env.NEYNAR_SIGNER_UUID || null,
    neynarFid: process.env.NEYNAR_FID || null,
    maxCrosspost: Number(process.env.CN_MAX_CROSSPOST || "3"),
    channelId: process.env.CN_CHANNEL_ID || null,
    baseRpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    arbmePrivateKey: process.env.ARBME_PRIVATE_KEY || null,
  };
}
