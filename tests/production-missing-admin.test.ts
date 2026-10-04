import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let store: typeof import("@/lib/dataverse/store");

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-noadmin-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "x.db").replace(/\\/g, "/")}`;
  process.env.DEMO_MODE = "0";
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  store = await import("@/lib/dataverse/store");
});

describe("DEMO_MODE=0 without admin credentials", () => {
  it("fails loudly instead of leaving a deployment nobody can administer", async () => {
    await expect(store.readDb()).rejects.toThrow(/ADMIN_EMAIL and ADMIN_PASSWORD/);
  });

  it("does not cache the failure, so a later request retries", async () => {
    await expect(store.readDb()).rejects.toThrow(/ADMIN_EMAIL/);
  });
});
