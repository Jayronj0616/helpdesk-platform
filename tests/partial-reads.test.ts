import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

let store: typeof import("@/lib/dataverse/store");
let dbmod: typeof import("@/lib/dataverse/db");

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-partial-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "partial.db").replace(/\\/g, "/")}`;
  process.env.DEMO_PASSWORD = "test-password-123";
  store = await import("@/lib/dataverse/store");
  dbmod = await import("@/lib/dataverse/db");
});

describe("readDb with a list of tables", () => {
  it("returns only the tables asked for", async () => {
    const db = await store.readDb(["users", "categories"]);
    expect(Object.keys(db).sort()).toEqual(["categories", "users"]);
    expect(db.users).toHaveLength(5);
    expect(db.categories).toHaveLength(4);
  });

  it("sends one query per requested table plus the counter, in a single round trip, and never touches the others", async () => {
    const client = await dbmod.getDb();
    const spy = vi.spyOn(client, "batch");
    await store.readDb(["tickets"]);
    const calls = spy.mock.calls.filter(([stmts]) => (stmts as { sql: string }[]).some((s) => s.sql.includes("FROM tickets")));
    expect(calls).toHaveLength(1);
    const sqls = (calls[0][0] as { sql: string }[]).map((s) => s.sql);
    expect(sqls.filter((s) => s.startsWith("SELECT * FROM"))).toEqual([expect.stringContaining("FROM tickets")]);
    expect(sqls.join(" ")).not.toMatch(/FROM (comments|flow_runs|users)/);
    spy.mockRestore();
  });

  it("returns the same rows, in the same order, as a full read", async () => {
    const full = await store.readDb();
    const some = await store.readDb(["tickets", "assets", "flowRuns"]);
    expect(some.tickets).toEqual(full.tickets);
    expect(some.assets).toEqual(full.assets);
    expect(some.flowRuns).toEqual(full.flowRuns);
  });

  it("a plain readDb() still returns everything, including the ticket counter", async () => {
    const full = await store.readDb();
    expect(Object.keys(full).sort()).toEqual(["assetRequests", "assets", "categories", "comments", "flowRuns", "nextTicketNumber", "notifications", "tickets", "users"]);
  });

  it("an empty list is allowed and returns nothing", async () => {
    expect(await store.readDb([])).toEqual({});
  });
});

describe("readComments", () => {
  it("returns one ticket's comments, oldest first, including internal notes (the caller filters)", async () => {
    const comments = await store.readComments("t1");
    expect(comments.map((c) => c.id)).toEqual(["m1", "m2", "m3"]);
    expect(comments.every((c) => c.ticketId === "t1")).toBe(true);
    expect(comments.some((c) => c.internal)).toBe(true);
  });

  it("returns nothing for a ticket with no comments and for an unknown id", async () => {
    expect(await store.readComments("t5")).toEqual([]);
    expect(await store.readComments("nope")).toEqual([]);
  });

  it("round-trips booleans and nulls like a full read", async () => {
    const [first] = await store.readComments("t1");
    expect(first).toMatchObject({ internal: false, kind: "comment", authorId: "u3" });
  });

  it("is not injectable through the ticket id", async () => {
    expect(await store.readComments("t1' OR '1'='1")).toEqual([]);
  });
});

describe("indexes", () => {
  it("are created on connect, and creating them again is harmless", async () => {
    const client = await dbmod.getDb();
    const names = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'index'")).rows.map((r) => String(r.name));
    expect(names).toEqual(expect.arrayContaining(["idx_comments_ticket", "idx_tickets_requester", "idx_tickets_assignee", "idx_tickets_status", "idx_requests_requester"]));
    const { INDEX_SQL } = await import("@/lib/dataverse/schema");
    await expect(client.batch(INDEX_SQL, "write")).resolves.toBeDefined();
  });

  it("the comments lookup uses the index instead of scanning the table", async () => {
    const client = await dbmod.getDb();
    const plan = (await client.execute("EXPLAIN QUERY PLAN SELECT * FROM comments WHERE ticket_id = 't1' ORDER BY created_at, id")).rows.map((r) => String(r.detail)).join(" ");
    expect(plan).toContain("idx_comments_ticket");
  });
});
