import crypto from "node:crypto";
import { getDb } from "../dataverse/db";

// Sliding-window limiter for sign-in, registration and password-change attempts. Attempts are
// stored in the database, so the limit holds across server instances and restarts (an in-memory
// counter resets on every cold start of a serverless function). Keys are hashed before they are
// stored, so the table never holds emails or IP addresses.
const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

export function createLimiter(max: number, windowMs: number) {
  return {
    /** Records an attempt. Returns false once `key` has made more than `max` attempts in the window. */
    async attempt(key: string, now = Date.now()): Promise<boolean> {
      const client = await getDb();
      const k = hashKey(key);
      const since = now - windowMs;
      const results = await client.batch(
        [
          { sql: "DELETE FROM auth_attempts WHERE at < ?", args: [since] },
          { sql: "INSERT INTO auth_attempts (key_hash, at) VALUES (?, ?)", args: [k, now] },
          { sql: "SELECT count(*) AS n FROM auth_attempts WHERE key_hash = ? AND at >= ?", args: [k, since] },
        ],
        "write",
      );
      return Number(results[2].rows[0].n) <= max;
    },
    /** Forget a key, for example after a successful sign-in. */
    async reset(key: string): Promise<void> {
      const client = await getDb();
      await client.execute({ sql: "DELETE FROM auth_attempts WHERE key_hash = ?", args: [hashKey(key)] });
    },
  };
}

export const loginLimiter = createLimiter(5, 15 * 60_000);
