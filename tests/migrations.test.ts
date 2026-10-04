import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { beforeAll, describe, expect, it } from "vitest";

let migrations: typeof import("@/lib/dataverse/migrations");
let tmp: string;

// What users looked like before migrations existed (version 1): no `active` column.
const V1_USERS = `CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('employee','agent','manager')), department TEXT)`;
const META = "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)";
// And tickets before ratings existed (versions 1 and 2): no rating columns.
const OLD_TICKETS = `CREATE TABLE tickets (id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT,
  requester_id TEXT NOT NULL, assignee_id TEXT, category_id TEXT NOT NULL, priority TEXT, status TEXT, asset_id TEXT,
  created_at TEXT, updated_at TEXT, due_at TEXT, resolved_at TEXT, escalated INTEGER)`;
const OLD_TICKET_ROW = "INSERT INTO tickets VALUES ('t1', 1001, 'Old ticket', 'd', 'u1', NULL, 'c1', 'high', 'resolved', NULL, 'a', 'b', 'c', 'd', 0)";

const urlFor = (name: string) => `file:${path.join(tmp, name).replace(/\\/g, "/")}`;

async function v1Database(name: string): Promise<Client> {
  const c = createClient({ url: urlFor(name) });
  await c.batch([V1_USERS, META, OLD_TICKETS, "INSERT INTO users VALUES ('u1', 'Old User', 'old@example.com', 'employee', 'IT')", OLD_TICKET_ROW], "write");
  return c;
}

const columns = async (c: Client, table = "users") => (await c.execute(`PRAGMA table_info(${table})`)).rows.map((r) => String(r.name));
const version = async (c: Client) => (await c.execute("SELECT value FROM meta WHERE key = 'schema_version'")).rows[0]?.value;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-mig-"));
  migrations = await import("@/lib/dataverse/migrations");
});

describe("migrations", () => {
  it("upgrades an existing version 1 database and keeps its data", async () => {
    const c = await v1Database("upgrade.db");
    expect(await columns(c)).not.toContain("active");

    await migrations.runMigrations(c, false);

    expect(await columns(c)).toContain("active");
    expect((await c.execute("SELECT active FROM users WHERE id = 'u1'")).rows[0].active).toBe(1); // existing users stay active
    expect(Number(await version(c))).toBe(migrations.LATEST_VERSION);
  });

  it("adds the rating columns to tickets and keeps existing tickets, unrated", async () => {
    const c = await v1Database("ratings.db");
    expect(await columns(c, "tickets")).not.toContain("rating");

    await migrations.runMigrations(c, false);

    expect(await columns(c, "tickets")).toEqual(expect.arrayContaining(["rating", "rating_comment", "rated_at"]));
    const row = (await c.execute("SELECT title, rating, rating_comment, rated_at FROM tickets WHERE id = 't1'")).rows[0];
    expect(row).toMatchObject({ title: "Old ticket", rating: null, rating_comment: null, rated_at: null });
  });

  it("adds waiting_since, pausing tickets that are already waiting from their last update", async () => {
    const c = await v1Database("waiting.db");
    await c.execute("INSERT INTO tickets VALUES ('t2', 1002, 'Waiting one', 'd', 'u1', NULL, 'c1', 'low', 'waiting', NULL, 'a', '2026-10-01T10:00:00.000Z', 'c', NULL, 0)");
    expect(await columns(c, "tickets")).not.toContain("waiting_since");

    await migrations.runMigrations(c, false);

    expect(await columns(c, "tickets")).toContain("waiting_since");
    const rows = (await c.execute("SELECT id, waiting_since FROM tickets ORDER BY id")).rows;
    expect(rows.find((r) => r.id === "t1")!.waiting_since).toBeNull(); // not waiting
    expect(rows.find((r) => r.id === "t2")!.waiting_since).toBe("2026-10-01T10:00:00.000Z");
  });

  it("upgrades a version 2 database (users.active present) to version 3 without touching users", async () => {
    const c = await v1Database("v2.db");
    await c.batch(["ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1", "INSERT INTO meta VALUES ('schema_version', '2')"], "write");

    await migrations.runMigrations(c, false);

    expect(await columns(c, "tickets")).toContain("rating");
    expect((await columns(c)).filter((n) => n === "active")).toHaveLength(1); // the version 2 step was not run again
    expect(Number(await version(c))).toBe(migrations.LATEST_VERSION);
  });

  it("the database refuses a rating outside 1 to 5", async () => {
    const c = await v1Database("check.db");
    await migrations.runMigrations(c, false);
    await expect(c.execute("UPDATE tickets SET rating = 9 WHERE id = 't1'")).rejects.toThrow();
    await expect(c.execute("UPDATE tickets SET rating = 5 WHERE id = 't1'")).resolves.toBeDefined();
  });

  it("is safe to run again", async () => {
    const c = await v1Database("twice.db");
    await migrations.runMigrations(c, false);
    await expect(migrations.runMigrations(c, false)).resolves.toBeUndefined();
    expect(Number(await version(c))).toBe(migrations.LATEST_VERSION);
  });

  it("survives two instances migrating the same database at once", async () => {
    const c = await v1Database("race.db");
    await expect(Promise.all([migrations.runMigrations(c, false), migrations.runMigrations(c, false)])).resolves.toBeDefined();
    expect(await columns(c)).toContain("active");
    expect(Number(await version(c))).toBe(migrations.LATEST_VERSION);
  });

  it("only stamps the version on a fresh database, without running migrations", async () => {
    const c = createClient({ url: urlFor("fresh.db") });
    await c.execute(META);
    await migrations.runMigrations(c, true);
    expect(Number(await version(c))).toBe(migrations.LATEST_VERSION);
  });

  it("migrations are numbered uniquely and start after version 1", () => {
    const versions = migrations.MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(Math.min(...versions)).toBeGreaterThan(1);
  });
});

describe("getDb on real databases", () => {
  it("creates a new database at the latest version, with active already in users", async () => {
    process.env.DATABASE_URL = urlFor("brandnew.db");
    const { getDb } = await import("@/lib/dataverse/db");
    const c = await getDb();
    expect(await columns(c)).toContain("active");
    expect(Number(await version(c))).toBe(migrations.LATEST_VERSION);
  });
});
