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

const urlFor = (name: string) => `file:${path.join(tmp, name).replace(/\\/g, "/")}`;

async function v1Database(name: string): Promise<Client> {
  const c = createClient({ url: urlFor(name) });
  await c.batch([V1_USERS, META, "INSERT INTO users VALUES ('u1', 'Old User', 'old@example.com', 'employee', 'IT')"], "write");
  return c;
}

const columns = async (c: Client) => (await c.execute("PRAGMA table_info(users)")).rows.map((r) => String(r.name));
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
