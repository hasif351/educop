// Counts failed attempts in a fixed window, per process. Swap for Redis or the
// hosting provider's limiter when running more than one instance.
const failures = new Map<string, { count: number; resetAt: number }>();

export function isBlocked(key: string, limit: number): { blocked: boolean; retryInSec: number } {
  const f = failures.get(key);
  if (!f || f.resetAt < Date.now()) return { blocked: false, retryInSec: 0 };
  return { blocked: f.count >= limit, retryInSec: Math.ceil((f.resetAt - Date.now()) / 1000) };
}

export function recordFailure(key: string, windowMs: number) {
  const now = Date.now();
  const f = failures.get(key);
  if (!f || f.resetAt < now) failures.set(key, { count: 1, resetAt: now + windowMs });
  else f.count++;
}

export function clearFailures(key: string) {
  failures.delete(key);
}
