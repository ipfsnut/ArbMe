/**
 * Poll /api/tx-receipt until confirmed, failed, or timeout.
 * For Safe wallets, skip polling (tx is a proposal, not on-chain yet).
 */
export async function waitForReceipt(
  hash: string,
  opts: { isSafe?: boolean; maxAttempts?: number; interval?: number } = {}
): Promise<boolean> {
  const { isSafe = false, maxAttempts = 30, interval = 2000 } = opts

  if (isSafe) {
    // Safe txs are proposals — can't poll receipt, just wait briefly
    await new Promise(r => setTimeout(r, 2000))
    return true
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(`/api/tx-receipt?hash=${hash}`)
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'success') return true
        if (data.status === 'failed') return false
      }
    } catch {
      // Network error, retry
    }
    await new Promise(r => setTimeout(r, interval))
  }

  // Timed out — tx may still succeed, return true to allow data refresh
  console.warn('[waitForReceipt] Timed out polling for', hash)
  return true
}
