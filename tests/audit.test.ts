import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

let store: typeof import("@/lib/dataverse/store");
let audit: typeof import("@/lib/audit");
let dbmod: typeof import("@/lib/dataverse/db");

const manager = { id: "u5", name: "Dina Ramos" };

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-audit-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "audit.db").replace(/\\/g, "/")}`;
  process.env.DEMO_PASSWORD = "test-password-123";
  store = await import("@/lib/dataverse/store");
  audit = await import("@/lib/audit");
  dbmod = await import("@/lib/dataverse/db");
});

const count = async () => Number((await (await dbmod.getDb()).execute("SELECT count(*) AS n FROM audit_log")).rows[0].n);

describe("addAudit (pure)", () => {
  it("adds an entry with a copy of the actor's name, and trims long text", () => {
    const db = { auditLog: [] as import("@/lib/dataverse/types").AuditEntry[] };
    audit.addAudit(db, { id: "u5", name: "Dina Ramos" }, "user.role_changed", { target: "T".repeat(500), detail: "D".repeat(900) }, Date.parse("2026-10-10T08:00:00Z"));
    expect(db.auditLog[0]).toMatchObject({ actorId: "u5", actorName: "Dina Ramos", action: "user.role_changed", at: "2026-10-10T08:00:00.000Z" });
    expect(db.auditLog[0].targetLabel).toHaveLength(120);
    expect(db.auditLog[0].detail).toHaveLength(300);
  });

  it("defaults the target and detail to null, and allows an actor with no id", () => {
    const db = { auditLog: [] as import("@/lib/dataverse/types").AuditEntry[] };
    audit.addAudit(db, { id: null, name: "System" }, "demo.reset");
    expect(db.auditLog[0]).toMatchObject({ actorId: null, targetLabel: null, detail: null });
  });

  it("every action has a readable label, and an unknown one is shown as it is", () => {
    for (const [code, text] of Object.entries(audit.AUDIT_ACTIONS)) {
      expect(text.length).toBeGreaterThan(3);
      expect(audit.auditLabel(code)).toBe(text);
    }
    expect(audit.auditLabel("something.new")).toBe("something.new");
  });
});

describe("the audit table is lazy and append-only", () => {
  it("is written in the same transaction as the change it describes", async () => {
    await store.mutate((db) => {
      db.categories.find((c) => c.id === "c1")!.name = "Hardware and devices";
      audit.addAudit(db, manager, "category.renamed", { target: "Hardware and devices", detail: "from Hardware" });
    });
    const page = await audit.readAudit();
    expect(page.entries[0]).toMatchObject({ action: "category.renamed", actorName: "Dina Ramos", targetLabel: "Hardware and devices" });
    expect((await store.readDb(["categories"])).categories.find((c) => c.id === "c1")!.name).toBe("Hardware and devices");
  });

  it("a change that rolls back leaves no audit entry behind", async () => {
    const before = await count();
    await expect(
      store.mutate((db) => {
        audit.addAudit(db, manager, "user.deactivated", { target: "Nobody" });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await count()).toBe(before);
  });

  it("ordinary reads and saves never query the audit table", async () => {
    const client = await dbmod.getDb();
    const batch = vi.spyOn(client, "batch");
    await store.readDb();
    await store.readDb(["tickets", "users"]);
    await store.mutate((db) => {
      db.tickets[0].title = db.tickets[0].title; // a save that changes nothing
    });
    const statements = batch.mock.calls.flatMap(([stmts]) => (stmts as { sql: string }[]).map((s) => s.sql));
    expect(statements.some((s) => s.includes("audit_log"))).toBe(false);
    batch.mockRestore();
  });

  it("a full read hands back an empty array for it, even when the table has rows", async () => {
    expect(await count()).toBeGreaterThan(0);
    expect((await store.readDb()).auditLog).toEqual([]);
  });

  it("saving something else never rewrites or deletes existing entries", async () => {
    const before = (await audit.readAudit({ perPage: 100 })).entries;
    await store.mutate((db) => {
      db.categories.find((c) => c.id === "c2")!.name = "Software and apps";
    });
    await store.mutate((db) => {
      db.tickets[0].updatedAt = new Date().toISOString();
    });
    expect((await audit.readAudit({ perPage: 100 })).entries).toEqual(before);
  });

  it("entries added by two saves both end up in the log, newest first", async () => {
    await store.mutate((db) => audit.addAudit(db, manager, "category.added", { target: "First" }, Date.now() + 1_000));
    await store.mutate((db) => audit.addAudit(db, manager, "category.added", { target: "Second" }, Date.now() + 2_000));
    const [newest, next] = (await audit.readAudit()).entries;
    expect([newest.targetLabel, next.targetLabel]).toEqual(["Second", "First"]);
  });

  it("the demo reset leaves the log alone", async () => {
    const before = await count();
    await store.resetDb();
    expect(await count()).toBe(before);
  });
});

describe("recordAudit (for changes made outside a transaction, such as passwords)", () => {
  it("stores an entry straight away", async () => {
    const before = await count();
    await audit.recordAudit({ id: "u1", name: "Maria Santos" }, "account.password_changed");
    expect(await count()).toBe(before + 1);
    // (looked up by action: earlier tests deliberately wrote entries with future times, which sort first)
    const mine = (await audit.readAudit({ action: "account.password_changed" })).entries[0];
    expect(mine).toMatchObject({ actorName: "Maria Santos", actorId: "u1", targetLabel: null });
  });
});

describe("readAudit", () => {
  beforeAll(async () => {
    // a known set to page through: 7 entries of two kinds, with fixed times
    const client = await dbmod.getDb();
    await client.execute("DELETE FROM audit_log");
    for (let i = 0; i < 7; i++) {
      await audit.recordAudit(manager, i % 2 ? "user.created" : "asset.added", { target: `Item ${i}` }, Date.parse("2026-10-01T00:00:00Z") + i * 60_000);
    }
  });

  it("returns newest first and says how many there are", async () => {
    const page = await audit.readAudit({ perPage: 3 });
    expect(page).toMatchObject({ total: 7, pages: 3, page: 1 });
    expect(page.entries.map((e) => e.targetLabel)).toEqual(["Item 6", "Item 5", "Item 4"]);
  });

  it("pages through all of them without gaps or repeats", async () => {
    const seen: string[] = [];
    for (const p of [1, 2, 3]) seen.push(...(await audit.readAudit({ perPage: 3, page: p })).entries.map((e) => e.targetLabel!));
    expect(seen).toEqual(["Item 6", "Item 5", "Item 4", "Item 3", "Item 2", "Item 1", "Item 0"]);
  });

  it("clamps a page number outside the range, including nonsense", async () => {
    expect((await audit.readAudit({ perPage: 3, page: 99 })).page).toBe(3);
    expect((await audit.readAudit({ perPage: 3, page: -4 })).page).toBe(1);
    expect((await audit.readAudit({ perPage: 3, page: Number("abc") })).page).toBe(1);
  });

  it("filters by one kind of action, and ignores a made-up action instead of failing or injecting", async () => {
    const created = await audit.readAudit({ action: "user.created" });
    expect(created.total).toBe(3);
    expect(created.entries.every((e) => e.action === "user.created")).toBe(true);
    expect((await audit.readAudit({ action: "nonsense" })).total).toBe(7);
    expect((await audit.readAudit({ action: "x' OR '1'='1" })).total).toBe(7);
  });

  it("reports an empty log as one empty page", async () => {
    expect(await audit.readAudit({ action: "flow.emails_sent" })).toEqual({ entries: [], total: 0, page: 1, pages: 1 });
  });
});
