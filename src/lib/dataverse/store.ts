import crypto from "node:crypto";
import type { InStatement, ResultSet, Row } from "@libsql/client";
import type { Comment, Database } from "./types";
import { seedDatabase, seedProduction } from "./seed";
import { ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_MODE, DEMO_PASSWORD } from "../config";
import { getDb } from "./db";
import { TABLES, snake, type TableSpec } from "./schema";
import { MIN_PASSWORD_LENGTH, hashPassword } from "../auth/password";

// SQL-backed stand-in for Dataverse. Pages and flows keep working on a plain `Database`
// object: readDb() loads it, mutate() loads it, runs your change, and writes back only the
// rows that changed, all inside one write transaction.

type Snapshot = Map<string, string>; // row id -> JSON of the row

const rowId = (r: unknown) => (r as { id: string }).id;

function fromSql(spec: TableSpec, row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(spec.columns)) {
    const raw = row[snake(name)];
    if (raw === null || raw === undefined) out[name] = null;
    else if (kind === "bool") out[name] = Number(raw) === 1;
    else if (kind === "int") out[name] = Number(raw);
    else if (kind === "json") out[name] = JSON.parse(String(raw));
    else out[name] = String(raw);
  }
  return out;
}

function toArgs(spec: TableSpec, obj: Record<string, unknown>) {
  return Object.entries(spec.columns).map(([name, kind]) => {
    const v = obj[name];
    if (v === null || v === undefined) return null;
    if (kind === "bool") return v ? 1 : 0;
    if (kind === "json") return JSON.stringify(v);
    return v as string | number;
  });
}

// One round trip: the tables asked for plus the ticket counter, in a single batch.
type TableKey = Exclude<keyof Database, "nextTicketNumber">;

function loadStatements(specs: TableSpec[]): InStatement[] {
  return [
    ...specs.map((spec) => ({ sql: `SELECT * FROM ${spec.sql} ORDER BY ${spec.orderBy}`, args: [] })),
    { sql: "SELECT value FROM meta WHERE key = 'nextTicketNumber'", args: [] },
  ];
}

function fromResults(results: ResultSet[], specs: TableSpec[] = TABLES): Database {
  const db: Record<string, unknown> = { nextTicketNumber: 1 };
  specs.forEach((spec, i) => {
    db[spec.key] = results[i].rows.map((r) => fromSql(spec, r));
  });
  const meta = results[specs.length].rows[0];
  if (meta) db.nextTicketNumber = Number(meta.value);
  return db as unknown as Database;
}

const ALL_LOAD = loadStatements(TABLES);

function snapshot(db: Database): Record<string, Snapshot> {
  const out: Record<string, Snapshot> = {};
  for (const spec of TABLES) {
    out[spec.key] = new Map((db[spec.key] as unknown[]).map((r) => [rowId(r), JSON.stringify(r)]));
  }
  return out;
}

// Writes the difference between `before` and `db`: upserts in parent-first order, then deletes child-first.
export function diffStatements(db: Database, before: Record<string, Snapshot>, nextTicketNumberBefore: number): InStatement[] {
  const upserts: InStatement[] = [];
  const deletes: InStatement[] = [];

  for (const spec of TABLES) {
    const old = before[spec.key] ?? new Map();
    const names = Object.keys(spec.columns);
    const cols = names.map(snake);
    const sql =
      `INSERT INTO ${spec.sql} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ` +
      `ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")}`;
    const seen = new Set<string>();

    for (const row of db[spec.key] as unknown[]) {
      const id = rowId(row);
      seen.add(id);
      if (old.get(id) !== JSON.stringify(row)) upserts.push({ sql, args: toArgs(spec, row as Record<string, unknown>) });
    }
    for (const id of old.keys()) {
      if (seen.has(id)) continue;
      // unshift reverses the order, so this runs: sessions, reset tokens, credentials, then the user row.
      deletes.unshift({ sql: `DELETE FROM ${spec.sql} WHERE id = ?`, args: [id] });
      if (spec.sql === "users") {
        deletes.unshift({ sql: "DELETE FROM auth_credentials WHERE user_id = ?", args: [id] });
        deletes.unshift({ sql: "DELETE FROM auth_reset_tokens WHERE user_id = ?", args: [id] });
        deletes.unshift({ sql: "DELETE FROM auth_sessions WHERE user_id = ?", args: [id] });
      }
    }
  }

  const meta: InStatement[] =
    db.nextTicketNumber !== nextTicketNumberBefore
      ? [{ sql: "INSERT INTO meta (key, value) VALUES ('nextTicketNumber', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [String(db.nextTicketNumber)] }]
      : [];
  return [...upserts, ...deletes, ...meta];
}

// First run. Demo mode seeds demo users (all with DEMO_PASSWORD) and sample data. With DEMO_MODE=0
// it creates the categories and one manager from ADMIN_EMAIL and ADMIN_PASSWORD, and fails loudly
// when those are missing so a deployment is never left with nobody who can sign in as admin.
// Every statement is idempotent, so two server instances starting together cannot corrupt it.
let seeded: Promise<void> | undefined;
export function ensureSeeded(): Promise<void> {
  seeded ??= (async () => {
    const client = await getDb();
    const done = await client.execute("SELECT value FROM meta WHERE key = 'seeded'");
    if (done.rows.length) return;

    let seed;
    let password: string;
    if (DEMO_MODE) {
      seed = seedDatabase();
      password = DEMO_PASSWORD;
    } else {
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("DEMO_MODE=0 needs ADMIN_EMAIL and ADMIN_PASSWORD to create the first manager account.");
      if (ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      seed = seedProduction(ADMIN_EMAIL);
      password = ADMIN_PASSWORD;
    }

    const stmts = diffStatements(seed, {}, 0);
    for (const u of seed.users) {
      stmts.push({ sql: "INSERT OR IGNORE INTO auth_credentials (user_id, password_hash) VALUES (?, ?)", args: [u.id, await hashPassword(password)] });
    }
    stmts.push({ sql: "INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', '1')", args: [] });
    await client.batch(stmts, "write");
  })().catch((err) => {
    seeded = undefined; // let the next request retry instead of caching the failure
    throw err;
  });
  return seeded;
}

/**
 * Loads the whole database, or only the tables a page needs. Prefer the list form on pages: a request
 * should not read every comment and every flow run to draw a dashboard. The result type contains only
 * the tables you named, so using one you did not ask for is a compile error, not an empty list at runtime.
 */
export async function readDb(): Promise<Database>;
export async function readDb<K extends TableKey>(only: readonly K[]): Promise<Pick<Database, K>>;
export async function readDb(only?: readonly TableKey[]): Promise<unknown> {
  await ensureSeeded();
  const client = await getDb();
  if (!only) return fromResults(await client.batch(ALL_LOAD, "read"));
  const specs = TABLES.filter((t) => only.includes(t.key));
  const db = fromResults(await client.batch(loadStatements(specs), "read"), specs) as unknown as Record<string, unknown>;
  delete db.nextTicketNumber; // not asked for, and not in the Pick type
  return db;
}

/** One ticket's comments, oldest first. A single indexed query instead of loading every comment. */
export async function readComments(ticketId: string): Promise<Comment[]> {
  await ensureSeeded();
  const spec = TABLES.find((t) => t.key === "comments")!;
  const res = await (await getDb()).execute({ sql: `SELECT * FROM comments WHERE ticket_id = ? ORDER BY ${spec.orderBy}`, args: [ticketId] });
  return res.rows.map((r) => fromSql(spec, r)) as unknown as Comment[];
}

// All writes in this process run one at a time. The write transaction also protects
// against other processes sharing the same database file.
let queue: Promise<unknown> = Promise.resolve();

export function mutate<T>(fn: (db: Database) => T): Promise<T> {
  const run = queue.then(async () => {
    await ensureSeeded();
    const client = await getDb();
    const tx = await client.transaction("write");
    try {
      const db = fromResults(await tx.batch(ALL_LOAD));
      const before = snapshot(db);
      const nextBefore = db.nextTicketNumber;
      const result = fn(db);
      const stmts = diffStatements(db, before, nextBefore);
      if (stmts.length) await tx.batch(stmts);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    } finally {
      tx.close();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

// Restores the demo data, including the demo accounts' passwords, because anyone can change those on a
// public demo and would otherwise lock every later visitor out. Users who registered themselves are
// removed along with their sessions. Sessions of the demo accounts are kept, so the manager who
// pressed the button stays signed in.
export async function resetDb(): Promise<void> {
  const seed = seedDatabase();
  await mutate((db) => {
    Object.assign(db, seedDatabase());
  });
  const client = await getDb();
  await client.batch(
    await Promise.all(
      seed.users.map(async (u) => ({
        sql: "INSERT INTO auth_credentials (user_id, password_hash) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash",
        args: [u.id, await hashPassword(DEMO_PASSWORD)],
      })),
    ),
    "write",
  );
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}
