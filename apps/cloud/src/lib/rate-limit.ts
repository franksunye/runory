// Simple in-memory rate limiter for public form submissions.
// MVP foundation: tracks submissions per IP address in a sliding window.
// In production, this should be backed by Redis or a similar store.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 submissions per IP per minute

const store = new Map<string, RateLimitEntry>();

// Periodically clean up expired entries to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  identifier: string,
  maxRequests: number = RATE_LIMIT_MAX_REQUESTS,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): RateLimitResult {
  cleanup();
  const now = Date.now();
  const existing = store.get(identifier);

  if (!existing || now > existing.resetAt) {
    const entry: RateLimitEntry = { count: 1, resetAt: now + windowMs };
    store.set(identifier, entry);
    return { allowed: true, remaining: maxRequests - 1, resetAt: entry.resetAt };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: maxRequests - existing.count, resetAt: existing.resetAt };
}

// Reset rate limit for testing
export function resetRateLimitStore(): void {
  store.clear();
}
