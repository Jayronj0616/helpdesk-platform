import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// These tests run against a real SQLite file in a temp folder. The modules are imported after
// DATABASE_URL is set because the client is created when db.ts loads.
const PASSWORD = "test-password-123";
let store: typeof import("@/lib/dataverse/store");
let creds: typeof import("@/lib/auth/credentials");
let sessions: typeof import("@/lib/auth/sessions");

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-test-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "test.db").replace(/\\/g, "/")}`;
  process.env.DEMO_PASSWORD = PASSWORD;
  store = await import("@/lib/dataverse/store");
  creds = await import("@/lib/auth/credentials");
  sessions = await import("@/lib/auth/sessions");
});

describe("database store", () => {
  it("seeds the demo data on first read", async () => {
    const db = await store.readDb();
    expect(db.users).toHaveLength(5);
    expect(db.tickets).toHaveLength(6);
    expect(db.comments.length).toBeGreaterThan(0);
    expect(db.nextTicketNumber).toBe(1007);
  });

  it("round-trips types: booleans, nulls and JSON", async () => {
    const db = await store.readDb();
    const t = db.tickets.find((x) => x.number === 1005)!;
    expect(t.assigneeId).toBeNull();
    expect(t.escalated).toBe(false);
    expect(db.comments.find((c) => c.id === "m2")!.internal).toBe(true);
  });

  it("persists changes made in mutate()", async () => {
    await store.mutate((db) => {
      db.tickets.find((t) => t.number === 1005)!.status = "waiting";
      db.tickets.find((t) => t.number === 1005)!.escalated = true;
    });
    const t = (await store.readDb()).tickets.find((x) => x.number === 1005)!;
    expect(t.status).toBe("waiting");
    expect(t.escalated).toBe(true);
  });

  it("rolls back everything when the callback throws", async () => {
    await expect(
      store.mutate((db) => {
        db.tickets[0].title = "SHOULD NOT PERSIST";
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await store.readDb()).tickets.some((t) => t.title === "SHOULD NOT PERSIST")).toBe(false);
  });

  it("keeps ticket numbers unique under concurrent writes", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.mutate((db) => db.nextTicketNumber++)),
    );
    expect(new Set(results).size).toBe(10);
    expect((await store.readDb()).nextTicketNumber).toBe(Math.max(...results) + 1);
  });

  it("returns newest flow runs first and caps them like the flows do", async () => {
    await store.mutate((db) => {
      db.flowRuns.unshift({ id: "run_old", flow: "f", trigger: "t", actions: ["a"], at: "2020-01-01T00:00:00.000Z" });
    });
    await store.mutate((db) => {
      db.flowRuns.unshift({ id: "run_new", flow: "f", trigger: "t", actions: ["b", "c"], at: "2021-01-01T00:00:00.000Z" });
    });
    const runs = (await store.readDb()).flowRuns;
    expect(runs.map((r) => r.id).slice(0, 2)).toEqual(["run_new", "run_old"]);
    expect(runs[0].actions).toEqual(["b", "c"]);
  });

  it("writes nothing when nothing changed", async () => {
    const db = await store.readDb();
    expect(store.diffStatements(db, snapshotOf(db), db.nextTicketNumber)).toEqual([]);
  });

  it("rejects rows that break foreign keys", async () => {
    await expect(store.mutate((db) => { db.tickets[0].categoryId = "no-such-category"; })).rejects.toThrow();
  });
});

function snapshotOf(db: import("@/lib/dataverse/types").Database) {
  const out: Record<string, Map<string, string>> = {};
  for (const key of ["users", "categories", "tickets", "comments", "assets", "assetRequests", "flowRuns"] as const) {
    out[key] = new Map((db[key] as { id: string }[]).map((r) => [r.id, JSON.stringify(r)]));
  }
  return out;
}

describe("authentication", () => {
  it("signs in a demo user with the right password", async () => {
    const u = await creds.authenticate("maria@contoso.test", PASSWORD);
    expect(u).toMatchObject({ id: "u1", role: "employee" });
  });

  it("is case-insensitive about the email", async () => {
    expect(await creds.authenticate("  MARIA@Contoso.Test ", PASSWORD)).not.toBeNull();
  });

  it("rejects a wrong password and an unknown email the same way", async () => {
    expect(await creds.authenticate("maria@contoso.test", "nope-nope-nope")).toBeNull();
    expect(await creds.authenticate("ghost@contoso.test", PASSWORD)).toBeNull();
  });

  it("never loads password hashes into the Database object", async () => {
    expect(JSON.stringify(await store.readDb())).not.toContain("scrypt");
  });
});

describe("registration", () => {
  it("creates an employee, whatever role is asked for", async () => {
    const r = await creds.registerUser({ name: "New Hire", email: "New.Hire@Example.com", department: "Ops", password: "longenough1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user).toMatchObject({ role: "employee", email: "new.hire@example.com", department: "Ops" });
    expect(await creds.authenticate("new.hire@example.com", "longenough1")).not.toBeNull();
  });

  it("rejects a duplicate email", async () => {
    const r = await creds.registerUser({ name: "Dup", email: "maria@contoso.test", department: "", password: "longenough1" });
    expect(r).toMatchObject({ ok: false });
  });

  it("rejects bad input", async () => {
    const base = { name: "X", email: "x@example.com", department: "", password: "longenough1" };
    expect(await creds.registerUser({ ...base, name: " " })).toMatchObject({ ok: false });
    expect(await creds.registerUser({ ...base, email: "not-an-email" })).toMatchObject({ ok: false });
    expect(await creds.registerUser({ ...base, password: "short" })).toMatchObject({ ok: false });
  });

  it("defaults the department", async () => {
    const r = await creds.registerUser({ name: "No Dept", email: "nodept@example.com", department: " ", password: "longenough1" });
    if (r.ok) expect(r.user.department).toBe("General");
  });
});

describe("sessions", () => {
  it("creates a session that resolves to its user", async () => {
    const token = await sessions.createSession("u3");
    expect(await sessions.getSessionUser(token)).toMatchObject({ id: "u3", role: "agent" });
  });

  it("does not store the raw token", async () => {
    const token = await sessions.createSession("u3");
    const { getDb } = await import("@/lib/dataverse/db");
    const rows = (await (await getDb()).execute("SELECT token_hash FROM auth_sessions")).rows;
    expect(rows.some((r) => String(r.token_hash) === token)).toBe(false);
  });

  it("rejects unknown tokens", async () => {
    expect(await sessions.getSessionUser("not-a-real-token")).toBeNull();
  });

  it("expires sessions", async () => {
    const token = await sessions.createSession("u3", 1_000);
    expect(await sessions.getSessionUser(token, 1_000 + sessions.SESSION_DAYS * 86_400_000 + 1)).toBeNull();
  });

  it("destroySession signs the user out", async () => {
    const token = await sessions.createSession("u3");
    await sessions.destroySession(token);
    expect(await sessions.getSessionUser(token)).toBeNull();
  });
});

describe("resetDb", () => {
  it("restores demo passwords and reactivates demo accounts that were changed or deactivated", async () => {
    const { getDb } = await import("@/lib/dataverse/db");
    expect(await (await import("@/lib/auth/credentials")).setPassword("u1", "changed-by-a-visitor-1")).toEqual({ ok: true });
    await (await getDb()).execute("UPDATE users SET active = 0 WHERE id = 'u2'");
    expect(await creds.authenticate("maria@contoso.test", PASSWORD)).toBeNull();
    expect(await creds.authenticate("carlo@contoso.test", PASSWORD)).toBeNull();

    await store.resetDb();

    expect(await creds.authenticate("maria@contoso.test", PASSWORD)).not.toBeNull();
    expect(await creds.authenticate("carlo@contoso.test", PASSWORD)).not.toBeNull();
    expect(await creds.authenticate("maria@contoso.test", "changed-by-a-visitor-1")).toBeNull();
  });

  it("restores the seed and removes self-registered users with their credentials and sessions", async () => {
    const reg = await creds.registerUser({ name: "Temp", email: "temp@example.com", department: "", password: "longenough1" });
    if (!reg.ok) throw new Error("setup failed");
    const token = await sessions.createSession(reg.user.id);

    await store.resetDb();

    const db = await store.readDb();
    expect(db.users.some((u) => u.email === "temp@example.com")).toBe(false);
    expect(db.users).toHaveLength(5);
    expect(db.tickets).toHaveLength(6);
    expect(db.nextTicketNumber).toBe(1007);
    expect(await sessions.getSessionUser(token)).toBeNull();
    expect(await creds.authenticate("temp@example.com", "longenough1")).toBeNull();
    // Demo accounts still work after a reset.
    expect(await creds.authenticate("dina@contoso.test", PASSWORD)).not.toBeNull();
  });
});
