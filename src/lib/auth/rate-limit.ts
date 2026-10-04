// Sliding-window limiter for login attempts. In memory, so it resets on restart and is per
// server instance. Put a shared store (Redis) behind it if you run more than one instance.
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  return {
    /** Records an attempt. Returns false once `key` has made more than `max` attempts in the window. */
    attempt(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      recent.push(now);
      hits.set(key, recent);
      return recent.length <= max;
    },
    /** Forget a key, for example after a successful sign-in. */
    reset(key: string) {
      hits.delete(key);
    },
  };
}

export const loginLimiter = createLimiter(5, 15 * 60_000);
