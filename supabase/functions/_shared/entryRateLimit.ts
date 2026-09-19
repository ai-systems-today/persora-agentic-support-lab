type Window = { startedAt: number; count: number };

const windows = new Map<string, Window>();
export const ENTRY_RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 } as const;

export function consumeEntryRateLimit(key: string, now = Date.now()) {
  const current = windows.get(key);
  const window = !current || now - current.startedAt >= ENTRY_RATE_LIMIT.windowMs
    ? { startedAt: now, count: 0 }
    : current;
  window.count += 1;
  windows.set(key, window);
  const retryAfterSeconds = Math.max(1, Math.ceil((window.startedAt + ENTRY_RATE_LIMIT.windowMs - now) / 1000));
  return {
    allowed: window.count <= ENTRY_RATE_LIMIT.maxRequests,
    remaining: Math.max(0, ENTRY_RATE_LIMIT.maxRequests - window.count),
    retryAfterSeconds,
  };
}

export async function requestRateLimitKey(req: Request, scope: string, fallback: string) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || req.headers.get("cf-connecting-ip") || fallback;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${scope}:${source}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function resetEntryRateLimitsForTests() {
  windows.clear();
}
