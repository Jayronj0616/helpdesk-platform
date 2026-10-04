import crypto from "node:crypto";
import type { Row, Transaction, InStatement } from "@libsql/client";
import type { Database } from "./types";
import { seedDatabase } from "./seed";
import { getDb } from "./db";
import { TABLES, snake, type TableSpec } from "./schema";
import { hashPassword } from "../auth/password";

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

async function load(tx: Pick<Transaction, "execute">): Promise<Database> {
  const db = { nextTicketNumber: 1, comments: [], users: [], categories: [], tickets: [], assets: [], assetRequests: [], flowRuns: [] } as Database;
  for (const spec of TABLES) {
    const res = await tx.execute(`SELECT * FROM ${spec.sql} ORDER BY ${spec.orderBy}`);
    (db[spec.key] as unknown[]) = res.rows.map((r) => fromSql(spec, r));
  }
  const meta = await tx.execute("SELECT value FROM meta WHERE key = 'nextTicketNumber'");
  if (meta.rows[0]) db.nextTicketNumber = Number(meta.rows[0].value);
  return db;
}

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
      // unshift reverses the order, so this runs: sessions, credentials, then the user row.
      deletes.unshift({ sql: `DELETE FROM ${spec.sql} WHERE id = ?`, args: [id] });
      if (spec.sql === "users") {
        deletes.unshift({ sql: "DELETE FROM auth_credentials WHERE user_id = ?", args: [id] });
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

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "helpdesk-demo";

// First run: create the demo data and give the demo users a password.
let seeded: Promise<void> | undefined;
export function ensureSeeded(): Promise<void> {
  seeded ??= (async () => {
    const client = await getDb();
    const done = await client.execute("SELECT value FROM meta WHERE key = 'seeded'");
    if (done.rows.length) return;

    const seed = seedDatabase();
    const stmts = diffStatements(seed, {}, 0);
    for (const u of seed.users) {
      const hash = await hashPassword(DEMO_PASSWORD);
      stmts.push({ sql: "INSERT OR IGNORE INTO auth_credentials (user_id, password_hash) VALUES (?, ?)", args: [u.id, hash] });
    }
    stmts.push({ sql: "INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', '1')", args: [] });
    await client.batch(stmts, "write");
  })();
  return seeded;
}

export async function readDb(): Promise<Database> {
  await ensureSeeded();
  return load(await getDb());
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
      const db = await load(tx);
      const before = snapshot(db);
      const nextBefore = db.nextTicketNumber;
      const result = fn(db);
      const stmts = diffStatements(db, before, nextBefore);
      for (const s of stmts) await tx.execute(s);
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

// Restores the demo data. Users who registered themselves are removed along with their sessions.
export async function resetDb(): Promise<void> {
  await mutate((db) => {
    Object.assign(db, seedDatabase());
  });
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}
