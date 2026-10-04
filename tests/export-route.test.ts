import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The route reads the signed-in user from cookies, which only exist inside a real request, so the session
// lookup is replaced here. Everything else (filters, database, CSV) is real.
const currentUser = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/session")>()), currentUser }));

let GET: typeof import("@/app/tickets/export/route").GET;
let store: typeof import("@/lib/dataverse/store");

const staff = { id: "u3", name: "Ana Cruz", email: "ana@contoso.test", role: "agent", department: "IT", active: true };
const employee = { ...staff, id: "u1", name: "Maria Santos", role: "employee" };
const req = (query = "") => new Request(`http://localhost/tickets/export${query}`);

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-export-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "export.db").replace(/\\/g, "/")}`;
  ({ GET } = await import("@/app/tickets/export/route"));
  store = await import("@/lib/dataverse/store");
});

describe("GET /tickets/export", () => {
  it("refuses signed-out visitors with 401", async () => {
    currentUser.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain("Laptop");
  });

  it("refuses employees with 403 and exports nothing", async () => {
    currentUser.mockResolvedValue(employee);
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("Laptop");
  });

  it("gives staff a CSV download of every ticket", async () => {
    currentUser.mockResolvedValue(staff);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="tickets-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const lines = (await res.text()).trim().split("\r\n");
    expect(lines[0].replace("\uFEFF", "")).toBe("Number,Title,Description,Requester,Assignee,Category,Priority,Status,Created,Due,Resolved,Escalated,Asset");
    expect(lines).toHaveLength(1 + 6);
    expect(lines.find((l) => l.startsWith("1001,"))).toContain("Laptop will not boot");
  });

  it("applies the same filters as the list", async () => {
    currentUser.mockResolvedValue(staff);
    const text = await (await GET(req("?q=vpn"))).text();
    expect(text.trim().split("\r\n")).toHaveLength(2);
    expect(text).toContain("Cannot connect to VPN");

    const none = await (await GET(req("?status=waiting&priority=critical"))).text();
    expect(none.trim().split("\r\n")).toHaveLength(1); // header only
  });

  it("writes names and dates, not ids, and neutralises formulas in user-supplied text", async () => {
    await store.mutate((db) => {
      db.tickets[0].title = '=HYPERLINK("http://evil.example","click")';
    });
    currentUser.mockResolvedValue(staff);
    const text = await (await GET(req())).text();
    expect(text).toContain("Maria Santos");
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(text).toContain("'=HYPERLINK");
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});
