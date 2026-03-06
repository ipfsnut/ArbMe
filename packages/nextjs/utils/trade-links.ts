/**
 * Shared trade link builder
 * Extracts pool → in-app trade URL logic so PoolCard, PoolsWidget,
 * traffic page, and landing page can all link to /trade/[pool] consistently.
 */

import type { Pool } from './types';

// Map token symbols to addresses (lowercase) for trade link construction
export const SYMBOL_TO_ADDRESS: Record<string, string> = {
  'ARBME': '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07',
  '$ARBME': '0xc647421c5dc78d1c3960faa7a33f9aefdf4b7b07',
  'RATCHET': '0x392bc5deea227043d69af0e67badcbbaed511b07',
  '$RATCHET': '0x392bc5deea227043d69af0e67badcbbaed511b07',
  'CHAOS': '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292',
  '$CHAOS': '0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292',
  'CHAOSLP': '0x8454d062506a27675706148ecdd194e45e44067a',
  '$CHAOSLP': '0x8454d062506a27675706148ecdd194e45e44067a',
  'ABC': '0x5c0872b790bb73e2b3a9778db6e7704095624b07',
  'ALPHACLAW': '0x8c19a8b92fa406ae097eb9ea8a4a44cbc10eafe2',
  'FLAY': '0xf1a7000000950c7ad8aff13118bb7ab561a448ee',
  'VIRTUAL': '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
  'CLANKER': '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb',
  'BNKR': '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b',
  'CNEWS': '0x01de044ad8eb037334ddda97a38bb0c798e4eb07',
  'PAGE': '0xc4730f86d1f86ce0712a7b17ee919db7defad7fe',
  'USDC': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  'WETH': '0x4200000000000000000000000000000000000006',
  'flETH': '0x000000000d564d5be76f7f0d28fe52605afc7cf8',
};

// Standard fee → tick spacing mapping (matches core-lib FEE_TO_TICK_SPACING)
export const FEE_TO_TICK: Record<number, number> = {
  100: 1, 500: 10, 3000: 60, 10000: 200,
  30000: 600, 50000: 1000, 100000: 2000, 150000: 3000,
  200000: 4000, 250000: 5000, 500000: 10000,
  8388608: 200, // Clanker dynamic fee
};

export function dexToVersion(dex: string): 'V2' | 'V3' | 'V4' | null {
  const lower = dex.toLowerCase();
  // Only support Uniswap pools — Balancer, Aerodrome, etc. need their own routers
  if (lower.includes('balancer') || lower.includes('aerodrome') || lower.includes('curve')) return null;
  if (lower.includes('v4')) return 'V4';
  if (lower.includes('v3')) return 'V3';
  if (lower.includes('v2') || lower.includes('uniswap')) return 'V2';
  return null; // Unknown DEX — don't try to swap
}

export function buildTradeHref(pool: Pool): string | null {
  const version = dexToVersion(pool.dex);

  // Non-Uniswap pools can't be swapped in-app
  if (!version) return null;

  // Try to resolve token addresses from pool data or symbol mapping
  const parts = pool.pair.split('/').map(s => s.trim());
  if (parts.length !== 2) return null;

  const t0 = pool.token0 || SYMBOL_TO_ADDRESS[parts[0].toUpperCase()] || SYMBOL_TO_ADDRESS[parts[0]];
  const t1 = pool.token1 || SYMBOL_TO_ADDRESS[parts[1].toUpperCase()] || SYMBOL_TO_ADDRESS[parts[1]];

  if (!t0 || !t1) return null;

  const fee = pool.fee || 3000;
  // Derive tick spacing from fee using canonical mapping
  const ts = FEE_TO_TICK[fee] || 60;

  const params = new URLSearchParams({
    t0,
    t1,
    v: version,
    fee: fee.toString(),
    ts: ts.toString(),
    pair: pool.pair,
  });

  return `/trade/${pool.pairAddress}?${params.toString()}`;
}
