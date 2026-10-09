import crypto from "node:crypto";
import type { User } from "../dataverse/types";
import { getDb } from "../dataverse/db";
import { ensureSeeded } from "../dataverse/store";
import { checkPassword, normalizeEmail, type PasswordResult } from "./credentials";
import { hashPassword } from "./password";
import { destroyUserSessions } from "./sessions";

export const RESET_TOKEN_MINUTES = 60;

// Only a hash of the token is stored, like session tokens, so a leaked database cannot be used to reset anyone.
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Creates a one-hour, single-use reset token for an active account and returns it with the user.
 * Returns null for unknown and deactivated accounts, and the caller must treat that exactly like
 * success (same response, same timing) so the form cannot be used to discover who has an account.
 * Asking again replaces any earlier link.
 */
export async function createResetToken(email: string, now = Date.now()): Promise<{ user: User; token: string } | null> {
  await ensureSeeded();
  const client = await getDb();
  const res = await client.execute({
    sql: "SELECT id, name, email, role, department FROM users WHERE email = ? AND active = 1",
    args: [normalizeEmail(email)],
  });
  const row = res.rows[0];
  if (!row) return null;

  const token = crypto.randomBytes(32).toString("base64url");
  await client.batch(
    [
      { sql: "DELETE FROM auth_reset_tokens WHERE expires_at < ? OR user_id = ?", args: [now, String(row.id)] },
      {
        sql: "INSERT INTO auth_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        args: [hashToken(token), String(row.id), now + RESET_TOKEN_MINUTES * 60_000],
      },
    ],
    "write",
  );
  const user: User = { id: String(row.id), name: String(row.name), email: String(row.email), role: row.role as User["role"], department: String(row.department), active: true };
  return { user, token };
}

/** True when the link is still usable. Used to decide whether to show the form. */
export async function isResetTokenValid(token: string, now = Date.now()): Promise<boolean> {
  await ensureSeeded();
  const client = await getDb();
  const res = await client.execute({
    sql: `SELECT 1 FROM auth_reset_tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = ? AND t.expires_at > ? AND u.active = 1`,
    args: [hashToken(token), now],
  });
  return res.rows.length > 0;
}

/**
 * Sets a new password using a reset token. The token is claimed with a single DELETE before anything
 * else changes, so two requests with the same link cannot both succeed. Every session of that user is
 * ended afterwards, because whoever had the old password or a stolen session must not stay signed in.
 * A weak password is rejected before the token is used up, so the person can try again.
 */
export async function consumeResetToken(token: string, password: string, now = Date.now()): Promise<PasswordResult | { ok: true; userId: string }> {
  const bad = checkPassword(password);
  if (bad) return { ok: false, error: bad };

  await ensureSeeded();
  const client = await getDb();
  const found = await client.execute({
    sql: `SELECT t.user_id FROM auth_reset_tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = ? AND t.expires_at > ? AND u.active = 1`,
    args: [hashToken(token), now],
  });
  const userId = found.rows[0]?.user_id;
  const invalid: PasswordResult = { ok: false, error: "This reset link is invalid or has expired. Request a new one." };
  if (!userId) return invalid;

  const hash = await hashPassword(password);
  const claimed = await client.execute({ sql: "DELETE FROM auth_reset_tokens WHERE token_hash = ?", args: [hashToken(token)] });
  if (claimed.rowsAffected !== 1) return invalid; // someone else used this link first

  await client.execute({ sql: "UPDATE auth_credentials SET password_hash = ? WHERE user_id = ?", args: [hash, String(userId)] });
  await destroyUserSessions(String(userId));
  return { ok: true, userId: String(userId) };
}
