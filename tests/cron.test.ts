import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let GET: typeof import("@/app/api/cron/maintenance/route").GET;
let store: typeof import("@/lib/dataverse/store");
const SECRET = "a-long-random-cron-secret";

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-cron-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "cron.db").replace(/\\/g, "/")}`;
  ({ GET } = await import("@/app/api/cron/maintenance/route"));
  store = await import("@/lib/dataverse/store");
});

afterEach(() => vi.unstubAllEnvs());

const call = (headers: Record<string, string> = {}) => GET(new Request("http://localhost/api/cron/maintenance", { headers }));

describe("GET /api/cron/maintenance", () => {
  it("does not exist when CRON_SECRET is not set, even for a request that sends a header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call()).status).toBe(404);
    expect((await call({ authorization: "Bearer " })).status).toBe(404);
  });

  it("rejects a missing, wrong or malformed secret with 401 and runs nothing", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const before = (await store.readDb(["flowRuns"])).flowRuns.length;
    // (a trailing space is not tested: HTTP strips it from header values before the route sees it)
    const bad: Record<string, string>[] = [{}, { authorization: "Bearer wrong" }, { authorization: SECRET }, { authorization: `bearer ${SECRET}` }, { authorization: `Bearer ${SECRET}x` }];
    for (const headers of bad) {
      const res = await call(headers);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ status: "unauthorized" });
    }
    expect((await store.readDb(["flowRuns"])).flowRuns.length).toBe(before);
  });

  it("runs both flows with the right secret, and the changes are saved", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    await store.mutate((db) => {
      const t = db.tickets.find((x) => x.number === 1003)!;
      t.resolvedAt = new Date(Date.now() - 10 * 86_400_000).toISOString(); // resolved 10 days ago
    });

    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", closed: 1 });
    expect(body.escalated).toBeGreaterThanOrEqual(1); // seeded ticket 1001 is overdue

    const db = await store.readDb(["tickets", "flowRuns"]);
    expect(db.tickets.find((t) => t.number === 1003)!.status).toBe("closed");
    expect(db.flowRuns.slice(0, 2).every((r) => r.trigger.startsWith("Scheduled run"))).toBe(true);
  });

  it("is safe to run again straight away", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(await res.json()).toMatchObject({ status: "ok", closed: 0, escalated: 0 });
  });
});
