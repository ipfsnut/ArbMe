/**
 * TOKEN_METADATA - Single Source of Truth for all token data
 *
 * All token decimals, symbols, icons, and colors are defined HERE and nowhere else.
 * V2/V3/V4 pool configs reference this data. Frontend receives it via injection.
 */

export interface TokenMetadata {
  address: string;
  symbol: string;
  decimals: number;
  icon: string | null;
  color: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE SINGLE SOURCE OF TRUTH FOR ALL TOKEN METADATA
// ═══════════════════════════════════════════════════════════════════════════════

export const TOKEN_METADATA: Record<string, TokenMetadata> = {
  ARBME: {
    address: "0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07",
    symbol: "ARBME",
    decimals: 18,
    icon: "https://arbme.epicdylan.com/arbie.png",
    color: "#10b981"
  },
  // DISABLED: USDC causes incorrect amounts in Uniswap frontend due to 6 decimals
  // USDC: {
  //   address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  //   symbol: "USDC",
  //   decimals: 6,  // CRITICAL: USDC has 6 decimals, not 18!
  //   icon: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  //   color: "#2775ca"
  // },
  WETH: {
    address: "0x4200000000000000000000000000000000000006",
    symbol: "WETH",
    decimals: 18,
    icon: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
    color: "#627eea"
  },
  PAGE: {
    address: "0xc4730f86d1F86cE0712a7b17EE919Db7dEFad7FE",
    symbol: "PAGE",
    decimals: 8,  // PAGE has 8 decimals
    icon: "https://arbme.epicdylan.com/pagedaologo.png",
    color: "#ff6b35"
  },
  OINC: {
    address: "0x59e058780dd8a6017061596a62288b6438edbe68",
    symbol: "OINC",
    decimals: 18,
    icon: "https://pbs.twimg.com/profile_images/1879950923135967232/8LPTu2Ow_400x400.jpg",
    color: "#ff69b4"
  },
  cbBTC: {
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    symbol: "cbBTC",
    decimals: 8,  // cbBTC has 8 decimals
    icon: "https://assets.coingecko.com/coins/images/40143/small/cbbtc.webp",
    color: "#f7931a"
  },
  CLANKER: {
    address: "0x1bc0c42215582d5a085795f4badbac3ff36d1bcb",
    symbol: "CLANKER",
    decimals: 18,
    icon: null,
    color: "#7a7a8f"
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DERIVED LOOKUPS (computed from single source)
// ═══════════════════════════════════════════════════════════════════════════════

// Lookup by address (lowercase normalized)
export const TOKEN_BY_ADDRESS: Record<string, TokenMetadata> =
  Object.fromEntries(
    Object.values(TOKEN_METADATA).map(t => [t.address.toLowerCase(), t])
  );

// Legacy compatibility: address → symbol
export const TOKEN_SYMBOLS: Record<string, string> =
  Object.fromEntries(
    Object.values(TOKEN_METADATA).map(t => [t.address.toLowerCase(), t.symbol])
  );

// Legacy compatibility: simple address map
export const TOKENS = {
  PAGE: TOKEN_METADATA.PAGE.address,
  OINC: TOKEN_METADATA.OINC.address,
  CLANKER: TOKEN_METADATA.CLANKER.address,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SAFE LOOKUP FUNCTIONS - Never default to 18!
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get token decimals by address.
 * Returns null if unknown - NEVER defaults to 18.
 * Caller must handle null case explicitly.
 */
export function getTokenDecimals(address: string): number | null {
  if (!address) return null;
  const token = TOKEN_BY_ADDRESS[address.toLowerCase()];
  return token?.decimals ?? null;
}

/**
 * Get token symbol by address.
 * Returns truncated address if unknown.
 */
export function getTokenSymbol(address: string): string {
  if (!address) return "???";
  const token = TOKEN_BY_ADDRESS[address.toLowerCase()];
  return token?.symbol ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Alias for backwards compatibility
export function getTokenSymbolBackend(address: string): string {
  return getTokenSymbol(address);
}

/**
 * Get full token metadata by address.
 * Returns null if unknown.
 */
export function getTokenMetadata(address: string): TokenMetadata | null {
  if (!address) return null;
  return TOKEN_BY_ADDRESS[address.toLowerCase()] ?? null;
}

/**
 * Get token icon URL by symbol or address.
 */
export function getTokenIcon(symbolOrAddress: string): string | null {
  // Try by symbol first
  const bySymbol = TOKEN_METADATA[symbolOrAddress.toUpperCase()];
  if (bySymbol?.icon) return bySymbol.icon;

  // Try by address
  const byAddress = TOKEN_BY_ADDRESS[symbolOrAddress.toLowerCase()];
  return byAddress?.icon ?? null;
}

/**
 * Get token color by symbol or address.
 */
export function getTokenColor(symbolOrAddress: string): string {
  const bySymbol = TOKEN_METADATA[symbolOrAddress.toUpperCase()];
  if (bySymbol?.color) return bySymbol.color;

  const byAddress = TOKEN_BY_ADDRESS[symbolOrAddress.toLowerCase()];
  return byAddress?.color ?? "#7a7a8f"; // Default gray
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECIMAL VALIDATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Safely parse decimals from various input types.
 * Handles: number, hex string ("0x12"), decimal string ("18"), null, undefined
 *
 * @param val - The value to parse (can be number, string, null, undefined)
 * @returns Parsed decimals (0-24 range) or null if invalid
 *
 * NEVER returns a default value - caller must handle null explicitly!
 */
export function toSafeDecimals(val: unknown): number | null {
  // Handle null/undefined
  if (val === null || val === undefined) {
    return null;
  }

  // Handle number directly
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val < 0 || val > 24 || !Number.isInteger(val)) {
      return null;
    }
    return val;
  }

  // Handle string
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return null;

    let parsed: number;

    // Check for hex string (0x prefix)
    if (trimmed.toLowerCase().startsWith('0x')) {
      parsed = parseInt(trimmed, 16);
    } else {
      parsed = parseInt(trimmed, 10);
    }

    // Validate the parsed result
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0 || parsed > 24) {
      return null;
    }

    return parsed;
  }

  // Unknown type
  return null;
}

/**
 * Safely parse decimals with a required fallback.
 * Use this when you MUST have a decimal value and have a known fallback.
 *
 * @param val - The value to parse
 * @param fallback - The fallback value to use if parsing fails
 * @returns Parsed decimals or fallback
 */
export function toSafeDecimalsWithFallback(val: unknown, fallback: number): number {
  const parsed = toSafeDecimals(val);
  if (parsed === null) {
    console.warn('[ArbMe] Invalid decimals value:', val, '- using fallback:', fallback);
    return fallback;
  }
  return parsed;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AMOUNT CONVERSION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert raw token amount (with decimals) to human-readable number.
 *
 * @param raw - Raw amount (BigInt, number, or hex string)
 * @param decimals - Token decimals (0-24)
 * @returns Human-readable number, or 0 if invalid
 *
 * Example: formatFromRaw("1000000", 6) → 1.0 (for USDC)
 * Example: formatFromRaw(BigInt("1000000000000000000"), 18) → 1.0 (for ETH)
 */
export function formatFromRaw(raw: bigint | number | string, decimals: number): number {
  if (raw === null || raw === undefined) return 0;
  if (decimals < 0 || decimals > 24) return 0;

  try {
    let rawNum: number;

    if (typeof raw === 'bigint') {
      rawNum = Number(raw);
    } else if (typeof raw === 'number') {
      rawNum = raw;
    } else if (typeof raw === 'string') {
      // Handle hex strings
      if (raw.toLowerCase().startsWith('0x')) {
        rawNum = Number(BigInt(raw));
      } else {
        rawNum = Number(raw);
      }
    } else {
      return 0;
    }

    if (!Number.isFinite(rawNum)) return 0;

    return rawNum / Math.pow(10, decimals);
  } catch {
    return 0;
  }
}

/**
 * Convert human-readable amount to raw token amount (BigInt).
 *
 * @param amount - Human-readable amount (number or string)
 * @param decimals - Token decimals (0-24)
 * @returns Raw amount as BigInt, or BigInt(0) if invalid
 *
 * Example: toRawAmount(1.5, 6) → BigInt(1500000) (for USDC)
 * Example: toRawAmount(1.5, 18) → BigInt(1500000000000000000) (for ETH)
 */
export function toRawAmount(amount: number | string, decimals: number): bigint {
  if (amount === null || amount === undefined) return BigInt(0);
  if (decimals < 0 || decimals > 24) return BigInt(0);

  try {
    let amountNum: number;

    if (typeof amount === 'number') {
      amountNum = amount;
    } else if (typeof amount === 'string') {
      amountNum = parseFloat(amount);
    } else {
      return BigInt(0);
    }

    if (!Number.isFinite(amountNum) || amountNum < 0) return BigInt(0);

    // Use floor to avoid rounding issues
    const raw = Math.floor(amountNum * Math.pow(10, decimals));
    return BigInt(raw);
  } catch {
    return BigInt(0);
  }
}

/**
 * Convert human-readable amount to raw with a buffer multiplier.
 * Useful for approvals where you want to approve slightly more than needed.
 *
 * @param amount - Human-readable amount
 * @param decimals - Token decimals
 * @param buffer - Buffer multiplier (e.g., 1.1 for 10% extra)
 * @returns Raw amount as BigInt with buffer applied
 */
export function toRawAmountWithBuffer(amount: number | string, decimals: number, buffer: number = 1.0): bigint {
  if (buffer <= 0) buffer = 1.0;

  const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(amountNum)) return BigInt(0);

  return toRawAmount(amountNum * buffer, decimals);
}
