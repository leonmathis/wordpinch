/**
 * In-memory fixed-window rate limiter. Used by `proxy.ts` to cap abuse on
 * the Vercel free plan without taking an external dependency.
 *
 * Trade-offs (acknowledged, acceptable for our use):
 *   - Per-instance memory: each Vercel Node runtime instance has its own
 *     map, so an attacker who hits two different cold-spawned instances
 *     gets twice the budget. In practice Vercel keeps a small number of
 *     instances warm per region, so the effective ceiling is a small
 *     multiple of the configured limit — still well within free-plan
 *     budgets.
 *   - Cold-start resets the window: also fine, since cold starts are rare
 *     under sustained traffic (which is exactly when we want the limit
 *     enforced).
 *
 * Keys are LRU-evicted at `LRU_MAX` to keep memory bounded; legitimate
 * users (who refresh keys frequently) stay hot, drive-by attackers age out.
 */

type Bucket = { count: number; resetAt: number };

const LRU_MAX = 5000;
const buckets = new Map<string, Bucket>();

function evictIfNeeded(): void {
  if (buckets.size <= LRU_MAX) return;
  const target = Math.floor(LRU_MAX * 0.9);
  const iter = buckets.keys();
  while (buckets.size > target) {
    const next = iter.next();
    if (next.done) break;
    buckets.delete(next.value);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
    evictIfNeeded();
  } else {
    // Touch for LRU recency.
    buckets.delete(key);
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetAt: bucket.resetAt,
  };
}
