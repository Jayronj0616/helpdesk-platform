import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// DEMO_MODE=0: a real deployment's first run. Env is set before the modules load because config.ts
// reads it at import time (vitest gives every test file its own module registry).
let store: typeof import("@/lib/dataverse/store");
let creds: typeof import("@/lib/auth/credentials");

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-prod-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "prod.db").replace(/\\/g, "/")}`;
  process.env.DEMO_MODE = "0";
  process.env.ADMIN_EMAIL = "Boss@Example.com";
  process.env.ADMIN_PASSWORD = "a-strong-admin-password";
  store = await import("@/lib/dataverse/store");
  creds = await import("@/lib/auth/credentials");
});

describe("first run with DEMO_MODE=0", () => {
  it("creates only the categories and one manager, with no demo data", async () => {
    const db = await store.readDb();
    expect(db.users).toHaveLength(1);
    expect(db.users[0]).toMatchObject({ email: "boss@example.com", role: "manager" });
    expect(db.categories).toHaveLength(4);
    expect(db.tickets).toEqual([]);
    expect(db.assets).toEqual([]);
    expect(db.nextTicketNumber).toBe(1001);
  });

  it("lets the admin sign in with ADMIN_PASSWORD, and nobody sign in with the demo password", async () => {
    expect(await creds.authenticate("boss@example.com", "a-strong-admin-password")).toMatchObject({ role: "manager" });
    expect(await creds.authenticate("boss@example.com", "helpdesk-demo")).toBeNull();
    expect(await creds.authenticate("maria@contoso.test", "helpdesk-demo")).toBeNull();
  });

  it("numbers the first ticket 1001", async () => {
    const n = await store.mutate((db) => db.nextTicketNumber++);
    expect(n).toBe(1001);
  });
});
