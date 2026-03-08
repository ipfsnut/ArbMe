/**
 * Fetch with timeout — prevents indefinite hangs on unresponsive APIs.
 */
export function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

/**
 * Safe JSON parse from a Response — returns null on non-JSON responses.
 */
export async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
