import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

let GET: typeof import("@/app/api/health/route").GET;

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-health-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "health.db").replace(/\\/g, "/")}`;
  ({ GET } = await import("@/app/api/health/route"));
});

describe("GET /api/health", () => {
  it("reports ok when the database is reachable, migrated and seeded, without caching", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reports a bare 503 with no details when the database fails", async () => {
    const store = await import("@/lib/dataverse/store");
    vi.spyOn(store, "ensureSeeded").mockRejectedValueOnce(new Error("secret connection string leaked here"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).toBe('{"status":"error"}');
    expect(body).not.toContain("secret");
  });
});
