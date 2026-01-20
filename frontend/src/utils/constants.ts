/**
 * Application constants
 */

export const ARBME_ADDRESS = '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07';
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
export const CLANKER_ADDRESS = '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb';

export const PRIMARY_POOLS = {
  ARBME_WETH: 'ARBME/WETH',
  ARBME_CLANKER: 'ARBME/CLANKER',
} as const;

export const API_BASE = import.meta.env.VITE_API_URL || 'https://arbme-api.dylan-259.workers.dev';

export const ROUTES = {
  HOME: '/',
  MY_POOLS: '/positions',
  POSITION_DETAIL: '/position',
} as const;
