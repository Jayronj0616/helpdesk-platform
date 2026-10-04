import type { User } from "../dataverse/types";
import { getDb } from "../dataverse/db";
import { ensureSeeded, newId } from "../dataverse/store";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "./password";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Verified against when the email is unknown, so a miss takes as long as a wrong password.
let dummyHash: Promise<string> | undefined;

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
  return { id: String(row.id), name: String(row.name), email: String(row.email), role: row.role as User["role"], department: String(row.department) };
}

export type RegisterResult = { ok: true; user: User } | { ok: false; error: string };

// Self-registration always creates an employee. Agents and managers are never self-service.
export async function registerUser(input: { name: string; email: string; department: string; password: string }): Promise<RegisterResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const department = input.department.trim() || "General";
  if (!name || name.length > 80) return { ok: false, error: "Enter your name (up to 80 characters)." };
  if (!EMAIL_RE.test(email) || email.length > 120) return { ok: false, error: "Enter a valid email address." };
  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (input.password.length > 200) return { ok: false, error: "Password is too long." };

  await ensureSeeded();
  const client = await getDb();
  const exists = await client.execute({ sql: "SELECT 1 FROM users WHERE email = ?", args: [email] });
  if (exists.rows.length) return { ok: false, error: "An account with this email already exists." };

  const user: User = { id: newId("u"), name, email, role: "employee", department: department.slice(0, 60) };
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
