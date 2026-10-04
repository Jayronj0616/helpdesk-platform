import type { Role, User } from "../dataverse/types";
import { getDb } from "../dataverse/db";
import { ensureSeeded, newId } from "../dataverse/store";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "./password";
import { destroyUserSessions } from "./sessions";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Verified against when the email is unknown, so a miss takes as long as a wrong password.
let dummyHash: Promise<string> | undefined;

const toUser = (r: Record<string, unknown>): User => ({
  id: String(r.id), name: String(r.name), email: String(r.email), role: r.role as Role, department: String(r.department),
});

export async function authenticate(email: string, password: string): Promise<User | null> {
  await ensureSeeded();
  const client = await getDb();
  const res = await client.execute({
    sql: `SELECT u.id, u.name, u.email, u.role, u.department, c.password_hash
          FROM users u JOIN auth_credentials c ON c.user_id = u.id WHERE u.email = ?`,
    args: [normalizeEmail(email)],
  });
  const row = res.rows[0];
  if (!row) {
    dummyHash ??= hashPassword("not-a-real-password");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  if (!(await verifyPassword(password, String(row.password_hash)))) return null;
  return toUser(row);
}

export type RegisterResult = { ok: true; user: User } | { ok: false; error: string };
export type PasswordResult = { ok: true } | { ok: false; error: string };

export function checkPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 200) return "Password is too long.";
  return null;
}

interface AccountInput {
  name: string;
  email: string;
  department: string;
  password: string;
}

/**
 * Creates a user and their credentials. This is the only place accounts are created. The role is
 * chosen by the caller: public registration always passes "employee", and only the admin page
 * (managers only) passes anything else.
 */
export async function createAccount(input: AccountInput, role: Role): Promise<RegisterResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const department = input.department.trim() || "General";
  if (!name || name.length > 80) return { ok: false, error: "Enter a name (up to 80 characters)." };
  if (!EMAIL_RE.test(email) || email.length > 120) return { ok: false, error: "Enter a valid email address." };
  const bad = checkPassword(input.password);
  if (bad) return { ok: false, error: bad };

  await ensureSeeded();
  const client = await getDb();
  const exists = await client.execute({ sql: "SELECT 1 FROM users WHERE email = ?", args: [email] });
  if (exists.rows.length) return { ok: false, error: "An account with this email already exists." };

  const user: User = { id: newId("u"), name, email, role, department: department.slice(0, 60) };
  const hash = await hashPassword(input.password);
  try {
    await client.batch(
      [
        { sql: "INSERT INTO users (id, name, email, role, department) VALUES (?, ?, ?, ?, ?)", args: [user.id, user.name, user.email, user.role, user.department] },
        { sql: "INSERT INTO auth_credentials (user_id, password_hash) VALUES (?, ?)", args: [user.id, hash] },
      ],
      "write",
    );
  } catch {
    // A concurrent registration won the UNIQUE(email) race.
    return { ok: false, error: "An account with this email already exists." };
  }
  return { ok: true, user };
}

// Self-registration always creates an employee. Agents and managers are never self-service.
export const registerUser = (input: AccountInput) => createAccount(input, "employee");

/** Sets a user's password and signs them out everywhere. Callers must have checked who is allowed to do this. */
export async function setPassword(userId: string, password: string): Promise<PasswordResult> {
  const bad = checkPassword(password);
  if (bad) return { ok: false, error: bad };
  const client = await getDb();
  const res = await client.execute({
    sql: "UPDATE auth_credentials SET password_hash = ? WHERE user_id = ?",
    args: [await hashPassword(password), userId],
  });
  if (res.rowsAffected === 0) return { ok: false, error: "Account not found." };
  await destroyUserSessions(userId);
  return { ok: true };
}

/** Self-service password change. Needs the current password, and keeps only the current session signed in. */
export async function changeOwnPassword(userId: string, current: string, next: string, keepToken?: string): Promise<PasswordResult> {
  const client = await getDb();
  const res = await client.execute({ sql: "SELECT password_hash FROM auth_credentials WHERE user_id = ?", args: [userId] });
  const hash = res.rows[0]?.password_hash;
  if (!hash || !(await verifyPassword(current, String(hash)))) return { ok: false, error: "Your current password is not correct." };
  if (current === next) return { ok: false, error: "Choose a new password that is different from the current one." };
  const bad = checkPassword(next);
  if (bad) return { ok: false, error: bad };

  await client.execute({ sql: "UPDATE auth_credentials SET password_hash = ? WHERE user_id = ?", args: [await hashPassword(next), userId] });
  await destroyUserSessions(userId, keepToken);
  return { ok: true };
}
