/**
 * Common constants shared across the application
 */

import { TOKEN_METADATA } from './tokens';

// ═══════════════════════════════════════════════════════════════════════════════
// Type Exports
// ═══════════════════════════════════════════════════════════════════════════════

export type Address = `0x${string}`;

// ═══════════════════════════════════════════════════════════════════════════════
// CORS Headers
// ═══════════════════════════════════════════════════════════════════════════════

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ═══════════════════════════════════════════════════════════════════════════════
// ARBME Token (main token for this app)
// ═══════════════════════════════════════════════════════════════════════════════

export const ARBME = {
  address: TOKEN_METADATA.ARBME.address,
  symbol: TOKEN_METADATA.ARBME.symbol,
  decimals: TOKEN_METADATA.ARBME.decimals,
};

// ═══════════════════════════════════════════════════════════════════════════════
// External APIs
// ═══════════════════════════════════════════════════════════════════════════════

export const GECKO_API = "https://api.geckoterminal.com/api/v2";

// ═══════════════════════════════════════════════════════════════════════════════
// Timeouts
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_TIMEOUT = 5000;  // 5 seconds
export const RPC_TIMEOUT = 4000;      // 4 seconds for RPC calls
export const GECKO_TIMEOUT = 6000;    // 6 seconds for GeckoTerminal

// ═══════════════════════════════════════════════════════════════════════════════
// Cache TTLs
// ═══════════════════════════════════════════════════════════════════════════════

export const TOKEN_PRICE_CACHE_KEY = "arbme-token-prices";
export const TOKEN_PRICE_CACHE_TTL = 300; // 5 minutes

// ═══════════════════════════════════════════════════════════════════════════════
// Base RPCs (fallbacks - Alchemy is added dynamically from env)
// ═══════════════════════════════════════════════════════════════════════════════

export const BASE_RPCS_FALLBACK = [
  "https://mainnet.base.org",
  "https://rpc.ankr.com/base",
  "https://base.drpc.org",
];

// ═══════════════════════════════════════════════════════════════════════════════
// ERC20 / ERC721 Selectors (shared across all versions)
// ═══════════════════════════════════════════════════════════════════════════════

export const ERC20_SELECTORS = {
  balanceOf: "0x70a08231",       // balanceOf(address)
  totalSupply: "0x18160ddd",     // totalSupply()
  allowance: "0xdd62ed3e",       // allowance(address,address)
  approve: "0x095ea7b3",         // approve(address,uint256)
  decimals: "0x313ce567",        // decimals()
  symbol: "0x95d89b41",          // symbol()
  name: "0x06fdde03",            // name()
};

export const ERC721_SELECTORS = {
  ownerOf: "0x6352211e",         // ownerOf(uint256)
  tokenOfOwnerByIndex: "0x2f745c59", // tokenOfOwnerByIndex(address,uint256)
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tip Jar
// ═══════════════════════════════════════════════════════════════════════════════

export const ARBME_TIP_WALLET = '0x2C421b1c21bB88F1418cC525934E62F2c48C19df';
