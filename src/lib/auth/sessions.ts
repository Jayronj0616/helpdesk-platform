import crypto from "node:crypto";
import type { User } from "../dataverse/types";
import { getDb } from "../dataverse/db";
import { ensureSeeded } from "../dataverse/store";

export const SESSION_DAYS = 7;

// Only a hash of the token is stored, so a leaked database cannot be used to sign in.
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string, now = Date.now()): Promise<string> {
  await ensureSeeded();
  const client = await getDb();
  const token = crypto.randomBytes(32).toString("base64url");
  await client.batch(
    [
      { sql: "DELETE FROM auth_sessions WHERE expires_at < ?", args: [now] },
      { sql: "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", args: [hashToken(token), userId, now + SESSION_DAYS * 86_400_000] },
    ],
    "write",
  );
  return token;
}

export async function getSessionUser(token: string, now = Date.now()): Promise<User | null> {
  await ensureSeeded();
  const client = await getDb();
  const res = await client.execute({
    sql: `SELECT u.id, u.name, u.email, u.role, u.department FROM auth_sessions s
          JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    args: [hashToken(token), now],
  });
  const r = res.rows[0];
  if (!r) return null;
  return { id: String(r.id), name: String(r.name), email: String(r.email), role: r.role as User["role"], department: String(r.department), active: true };
}

/** Signs a user out everywhere, optionally keeping one session (the one making the change). */
export async function destroyUserSessions(userId: string, exceptToken?: string): Promise<void> {
  const client = await getDb();
  await client.execute(
    exceptToken
      ? { sql: "DELETE FROM auth_sessions WHERE user_id = ? AND token_hash <> ?", args: [userId, hashToken(exceptToken)] }
      : { sql: "DELETE FROM auth_sessions WHERE user_id = ?", args: [userId] },
  );
}

export async function destroySession(token: string): Promise<void> {
  const client = await getDb();
  await client.execute({ sql: "DELETE FROM auth_sessions WHERE token_hash = ?", args: [hashToken(token)] });
}
