import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let rl: typeof import("@/lib/auth/rate-limit");
let dbmod: typeof import("@/lib/dataverse/db");

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-rl-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "rl.db").replace(/\\/g, "/")}`;
  rl = await import("@/lib/auth/rate-limit");
  dbmod = await import("@/lib/dataverse/db");
});

describe("database-backed login rate limiter", () => {
  it("allows up to max attempts in the window, then blocks", async () => {
    const l = rl.createLimiter(3, 1000);
    const results = [];
    for (const t of [1, 2, 3, 4]) results.push(await l.attempt("a", t));
    expect(results).toEqual([true, true, true, false]);
  });

  it("tracks keys independently", async () => {
    const l = rl.createLimiter(1, 1000);
    expect(await l.attempt("k1", 0)).toBe(true);
    expect(await l.attempt("k2", 0)).toBe(true);
    expect(await l.attempt("k1", 1)).toBe(false);
  });

  it("allows attempts again once the window has passed", async () => {
    const l = rl.createLimiter(1, 1000);
    await l.attempt("w", 0);
    expect(await l.attempt("w", 500)).toBe(false);
    expect(await l.attempt("w", 2000)).toBe(true);
  });

  it("reset clears a key after a successful sign-in", async () => {
    const l = rl.createLimiter(1, 1000);
    await l.attempt("r", 0);
    await l.reset("r");
    expect(await l.attempt("r", 1)).toBe(true);
  });

  it("shares state through the database, so a new limiter instance sees earlier attempts", async () => {
    await rl.createLimiter(1, 1000).attempt("shared", 0);
    expect(await rl.createLimiter(1, 1000).attempt("shared", 1)).toBe(false);
  });

  it("stores only a hash of the key, never the email or IP", async () => {
    await rl.createLimiter(5, 1000).attempt("1.2.3.4|someone@example.com", 0);
    const rows = (await (await dbmod.getDb()).execute("SELECT key_hash FROM auth_attempts")).rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(String(r.key_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("deletes attempts that have aged out of the window", async () => {
    const l = rl.createLimiter(5, 1000);
    await l.attempt("old", 0);
    await l.attempt("new", 10_000);
    const n = (await (await dbmod.getDb()).execute({ sql: "SELECT count(*) AS n FROM auth_attempts WHERE at < ?", args: [9_000] })).rows[0].n;
    expect(Number(n)).toBe(0);
  });
});
