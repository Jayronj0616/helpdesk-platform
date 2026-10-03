import { describe, expect, it } from "vitest";
import { seedDatabase } from "@/lib/dataverse/seed";
import { filterTickets, isOverdue, paginate } from "@/lib/dataverse/queries";

const nums = (ts: { number: number }[]) => ts.map((t) => t.number).sort();

describe("isOverdue", () => {
  const db = seedDatabase();
  const t = (n: number) => db.tickets.find((x) => x.number === n)!;

  it("flags open tickets past their due date", () => expect(isOverdue(t(1001))).toBe(true));
  it("ignores open tickets still within SLA", () => expect(isOverdue(t(1002))).toBe(false));
  it("ignores closed tickets even when past due", () => expect(isOverdue(t(1004))).toBe(false));
});

describe("filterTickets", () => {
  const db = seedDatabase();
  const run = (f: Parameters<typeof filterTickets>[2]) => filterTickets(db, db.tickets, f);

  it("returns everything with no filters", () => expect(run({})).toHaveLength(6));
  it("filters by status", () => expect(nums(run({ status: "waiting" }))).toEqual([1002]));
  it("filters by priority", () => expect(nums(run({ priority: "high" }))).toEqual([1001, 1005]));
  it("filters by category", () => expect(nums(run({ categoryId: "c3" }))).toEqual([1002, 1005]));
  it("filters by assignee", () => expect(nums(run({ assignee: "u4" }))).toEqual([1002, 1004]));
  it("filters unassigned tickets", () => expect(nums(run({ assignee: "none" }))).toEqual([1005]));
  it("filters overdue only", () => expect(nums(run({ overdue: true }))).toEqual([1001]));
  it("combines filters with AND", () => expect(run({ priority: "high", status: "new" }).map((t) => t.number)).toEqual([1005]));

  describe("search", () => {
    it("matches the title, ignoring case", () => expect(nums(run({ q: "VPN" }))).toEqual([1002]));
    it("matches the description", () => expect(nums(run({ q: "black screen" }))).toEqual([1001]));
    it("matches the ticket number, with or without #", () => {
      expect(nums(run({ q: "1005" }))).toEqual([1005]);
      expect(nums(run({ q: "#1005" }))).toEqual([1005]);
    });
    it("matches the requester name", () => expect(nums(run({ q: "carlo" }))).toEqual([1002, 1004, 1006]));
    it("ignores surrounding whitespace", () => expect(nums(run({ q: "  vpn " }))).toEqual([1002]));
    it("returns nothing when no ticket matches", () => expect(run({ q: "zzz" })).toEqual([]));
  });

  describe("sorting", () => {
    it("defaults to newest first", () => expect(run({})[0].number).toBe(1005));
    it("sorts oldest first", () => expect(run({ sort: "oldest" })[0].number).toBe(1004));
    it("sorts by earliest due date", () => expect(run({ sort: "due" })[0].number).toBe(1004));
    it("sorts highest priority first", () => expect(["high", "critical"]).toContain(run({ sort: "priority" })[0].priority));
  });

  it("does not mutate the input array", () => {
    const before = db.tickets.map((t) => t.id);
    run({ sort: "oldest" });
    expect(db.tickets.map((t) => t.id)).toEqual(before);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("returns the first page", () => {
    const p = paginate(items, 1, 10);
    expect(p).toMatchObject({ page: 1, pages: 3, total: 25 });
    expect(p.items).toEqual(items.slice(0, 10));
  });
  it("returns a short last page", () => expect(paginate(items, 3, 10).items).toHaveLength(5));
  it("clamps pages above the range", () => expect(paginate(items, 99, 10).page).toBe(3));
  it("clamps pages below the range", () => expect(paginate(items, -4, 10).page).toBe(1));
  it("treats NaN as page 1", () => expect(paginate(items, Number("abc"), 10).page).toBe(1));
  it("handles an empty list", () => expect(paginate([], 1, 10)).toMatchObject({ page: 1, pages: 1, total: 0, items: [] }));
});
