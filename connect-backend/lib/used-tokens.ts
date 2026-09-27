/**
 * Best-effort one-time token set for the current serverless instance.
 * Cookie clear + short TTL is the primary control; this blocks replays on warm instances.
 */
const used = new Map<string, number>();
const MAX = 5_000;

export function consumeOnce(key: string, expMs: number): boolean {
  const now = Date.now();
  // opportunistic GC
  if (used.size > MAX) {
    for (const [k, exp] of used) {
      if (exp < now) used.delete(k);
    }
  }
  if (used.has(key)) return false;
  used.set(key, expMs);
  return true;
}
