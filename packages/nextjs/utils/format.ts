/**
 * Formatting utilities for numbers and currencies
 */

/**
 * Formats a USD value with appropriate precision
 * @param value - Number to format
 * @returns Formatted string like "$1.23K" or "$1.23M"
 */
export function formatUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(4)}`;
}

/**
 * Formats a price with appropriate precision
 * Never uses scientific notation - always shows decimal places
 */
export function formatPrice(price: string | number): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '—';

  // For prices >= $1, show 4 decimals
  if (num >= 1) {
    return `$${num.toFixed(4)}`;
  }

  // For prices >= $0.0001, show 6 decimals
  if (num >= 0.0001) {
    return `$${num.toFixed(6)}`;
  }

  // For very small prices, show 8-10 decimals to avoid scientific notation
  if (num >= 0.00000001) {
    return `$${num.toFixed(10)}`;
  }

  // For extremely small prices, show even more decimals
  return `$${num.toFixed(12)}`;
}

/**
 * Formats a percentage change with sign
 */
export function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

/**
 * Truncates an Ethereum address
 */
export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Formats a number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Formats ARBME price as market cap (price × 100B supply)
 */
export function formatArbmeMarketCap(priceUsd: string | number): string {
  const price = typeof priceUsd === 'string' ? parseFloat(priceUsd) : priceUsd;
  if (isNaN(price)) return '—';

  const ARBME_SUPPLY = 100_000_000_000; // 100 billion
  const marketCap = price * ARBME_SUPPLY;

  return formatUsd(marketCap);
}
