import { describe, expect, it } from "vitest";
import { seedDatabase } from "@/lib/dataverse/seed";
import type { Comment, Ticket } from "@/lib/dataverse/types";
import {
  breakdown, buildReport, byAgent, dailyTrend, firstResponseHours, formatDuration, formatPercent, inPeriod, median, metSla, parsePeriod,
  resolutionHours, stats, summarize,
} from "@/lib/dataverse/reports";

const NOW = Date.parse("2026-10-10T12:00:00.000Z");
const HOUR = 3_600_000;
const at = (hoursBeforeNow: number) => new Date(NOW - hoursBeforeNow * HOUR).toISOString();

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: "t", number: 1, title: "T", description: "", requesterId: "u1", assigneeId: "u3", categoryId: "c1", priority: "medium",
    status: "resolved", assetId: null, createdAt: at(50), updatedAt: at(10), dueAt: at(26), resolvedAt: at(40), escalated: false,
    rating: null, ratingComment: null, ratedAt: null, waitingSince: null, ...over,
  };
}
const comment = (over: Partial<Comment>): Comment => ({ id: "m", ticketId: "t", authorId: "u3", body: "b", kind: "comment", internal: false, createdAt: at(48), ...over });

describe("parsePeriod and inPeriod", () => {
  it("reads valid periods, defaults to 30 days, and ignores anything else", () => {
    expect(parsePeriod("7")).toEqual({ key: "7", days: 7 });
    expect(parsePeriod("90")).toEqual({ key: "90", days: 90 });
    expect(parsePeriod("all")).toEqual({ key: "all", days: null });
    for (const bad of [undefined, "", "1", "-5", "30; DROP", ["7", "30"]]) expect(parsePeriod(bad as string)).toEqual({ key: "30", days: 30 });
  });

  it("keeps tickets created inside the window, including the edge, and everything for all time", () => {
    const tickets = [ticket({ id: "new", createdAt: at(24) }), ticket({ id: "edge", createdAt: at(7 * 24) }), ticket({ id: "old", createdAt: at(7 * 24 + 1) })];
    expect(inPeriod(tickets, 7, NOW).map((t) => t.id)).toEqual(["new", "edge"]);
    expect(inPeriod(tickets, null, NOW)).toHaveLength(3);
  });
});

describe("resolutionHours and metSla", () => {
  it("measures created to resolved in hours", () => {
    expect(resolutionHours(ticket({ createdAt: at(50), resolvedAt: at(40) }))).toBe(10);
  });

  it("counts Closed tickets that have a resolved time, and nothing that is still open", () => {
    expect(resolutionHours(ticket({ status: "closed" }))).toBe(10);
    expect(resolutionHours(ticket({ status: "in_progress", resolvedAt: null }))).toBeNull();
    expect(resolutionHours(ticket({ status: "resolved", resolvedAt: null }))).toBeNull(); // a reopened ticket loses its resolved time
  });

  it("met means resolved at or before the due date", () => {
    expect(metSla(ticket({ dueAt: at(39), resolvedAt: at(40) }))).toBe(true);
    expect(metSla(ticket({ dueAt: at(40), resolvedAt: at(40) }))).toBe(true); // exactly on time
    expect(metSla(ticket({ dueAt: at(41), resolvedAt: at(40) }))).toBe(false);
    expect(metSla(ticket({ status: "new", resolvedAt: null }))).toBeNull();
  });
});

describe("median", () => {
  it("handles odd, even and empty lists without changing the input", () => {
    const xs = [5, 1, 3];
    expect(median(xs)).toBe(3);
    expect(xs).toEqual([5, 1, 3]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNull();
  });
});

describe("firstResponseHours", () => {
  const users = seedDatabase().users; // u3 and u4 are agents, u1 an employee
  const t = ticket({ createdAt: at(50) });

  it("is the time to the first public comment by IT staff", () => {
    const comments = [comment({ createdAt: at(40) }), comment({ id: "m2", createdAt: at(45) }), comment({ id: "m3", authorId: "u4", createdAt: at(30) })];
    expect(firstResponseHours(t, comments, users)).toBe(5);
  });

  it("ignores internal notes, the customer's own comments, system entries and other tickets", () => {
    const comments = [
      comment({ internal: true, createdAt: at(49) }),
      comment({ id: "m2", authorId: "u1", createdAt: at(49) }),
      comment({ id: "m3", authorId: null, kind: "system", createdAt: at(49) }),
      comment({ id: "m4", ticketId: "other", createdAt: at(49) }),
    ];
    expect(firstResponseHours(t, comments, users)).toBeNull();
  });

  it("is null when nobody has replied", () => {
    expect(firstResponseHours(t, [], users)).toBeNull();
  });
});

describe("stats", () => {
  it("counts totals, open, resolved and the share that met their SLA", () => {
    const s = stats(
      [
        ticket({ id: "a", dueAt: at(39) }), // met
        ticket({ id: "b", dueAt: at(41) }), // missed
        ticket({ id: "c", status: "in_progress", resolvedAt: null, dueAt: at(-10) }), // open, within SLA
      ],
      NOW,
    );
    expect(s).toMatchObject({ total: 3, open: 1, resolved: 2, slaCompliance: 0.5, avgResolutionHours: 10 });
  });

  it("counts open tickets past their due date, but never Waiting ones (their clock is paused)", () => {
    const s = stats(
      [
        ticket({ id: "a", status: "in_progress", resolvedAt: null, dueAt: at(1) }),
        ticket({ id: "b", status: "waiting", resolvedAt: null, dueAt: at(1), waitingSince: at(2) }),
      ],
      NOW,
    );
    expect(s.breachedOpen).toBe(1);
  });

  it("averages ratings that exist and says how many there were", () => {
    const s = stats([ticket({ id: "a", rating: 5 }), ticket({ id: "b", rating: 3 }), ticket({ id: "c" })], NOW);
    expect(s).toMatchObject({ avgRating: 4, ratingCount: 2 });
  });

  it("returns nulls instead of NaN or 0 when there is nothing to average", () => {
    expect(stats([], NOW)).toEqual({ total: 0, open: 0, resolved: 0, breachedOpen: 0, slaCompliance: null, avgResolutionHours: null, avgRating: null, ratingCount: 0 });
    const open = stats([ticket({ status: "new", resolvedAt: null })], NOW);
    expect(open.slaCompliance).toBeNull();
    expect(open.avgResolutionHours).toBeNull();
  });
});

describe("summarize", () => {
  it("adds the median first response time over tickets that got one", () => {
    const users = seedDatabase().users;
    const tickets = [ticket({ id: "a", createdAt: at(50) }), ticket({ id: "b", createdAt: at(50) }), ticket({ id: "c", createdAt: at(50) })];
    const comments = [
      comment({ ticketId: "a", createdAt: at(49) }), // 1h
      comment({ id: "m2", ticketId: "b", createdAt: at(46) }), // 4h
    ]; // c never got a reply, so it does not count
    expect(summarize(tickets, comments, users, NOW).medianFirstResponseHours).toBe(2.5);
  });
});

describe("breakdown and byAgent", () => {
  const db = seedDatabase();

  it("groups tickets, busiest first, and omits empty groups", () => {
    const rows = breakdown([ticket({ id: "a", categoryId: "c1" }), ticket({ id: "b", categoryId: "c3" }), ticket({ id: "c", categoryId: "c3" })], (t) => t.categoryId, (k) => k.toUpperCase(), NOW);
    expect(rows.map((r) => [r.label, r.total])).toEqual([["C3", 2], ["C1", 1]]);
  });

  it("orders ties by label so the page does not jump around", () => {
    const rows = breakdown([ticket({ id: "a", categoryId: "b" }), ticket({ id: "b", categoryId: "a" })], (t) => t.categoryId, (k) => k, NOW);
    expect(rows.map((r) => r.label)).toEqual(["a", "b"]);
  });

  it("lists every IT person, even with no tickets, plus an Unassigned row, and never employees", () => {
    const tickets = [ticket({ id: "a", assigneeId: "u3" }), ticket({ id: "b", assigneeId: null, status: "new", resolvedAt: null })];
    const rows = byAgent(db, tickets, NOW);
    expect(rows.map((r) => r.label).sort()).toEqual(["Ana Cruz", "Ben Lim", "Dina Ramos", "Unassigned"]);
    expect(rows.find((r) => r.label === "Ben Lim")!.total).toBe(0);
    expect(rows.find((r) => r.label === "Ana Cruz")!.resolved).toBe(1);
    expect(rows.some((r) => r.label === "Maria Santos")).toBe(false);
  });

  it("marks deactivated staff and omits Unassigned when everything is assigned", () => {
    const users = db.users.map((u) => (u.id === "u4" ? { ...u, active: false } : u));
    const rows = byAgent({ users }, [ticket({ assigneeId: "u3" })], NOW);
    expect(rows.some((r) => r.label === "Ben Lim (deactivated)")).toBe(true);
    expect(rows.some((r) => r.label === "Unassigned")).toBe(false);
  });
});

describe("dailyTrend", () => {
  it("counts created and resolved per UTC day, zero filled, oldest first", () => {
    const tickets = [
      ticket({ id: "a", createdAt: "2026-10-09T01:00:00.000Z", resolvedAt: "2026-10-10T01:00:00.000Z" }),
      ticket({ id: "b", createdAt: "2026-10-10T05:00:00.000Z", status: "new", resolvedAt: null }),
    ];
    const trend = dailyTrend(tickets, 3, NOW);
    expect(trend).toEqual([
      { day: "2026-10-08", created: 0, resolved: 0 },
      { day: "2026-10-09", created: 1, resolved: 0 },
      { day: "2026-10-10", created: 1, resolved: 1 },
    ]);
  });

  it("ignores events outside the window", () => {
    const trend = dailyTrend([ticket({ createdAt: "2026-08-01T00:00:00.000Z", resolvedAt: "2026-08-02T00:00:00.000Z" })], 14, NOW);
    expect(trend.every((p) => p.created === 0 && p.resolved === 0)).toBe(true);
    expect(trend).toHaveLength(14);
  });
});

describe("buildReport", () => {
  it("works on the seed data: names categories, orders priorities from most to least urgent, and keeps a 14 day trend", () => {
    const db = seedDatabase();
    const r = buildReport(db, null);
    expect(r.count).toBe(6);
    expect(r.summary).toMatchObject({ total: 6, resolved: 2 });
    expect(r.categories.map((c) => c.label)).toEqual(expect.arrayContaining(["Hardware", "Software", "Network"]));
    const order = ["Critical", "High", "Medium", "Low"];
    const labels = r.priorities.map((p) => p.label);
    expect(labels).toEqual(order.filter((o) => labels.includes(o)));
    expect(r.trend).toHaveLength(14);
  });

  it("limits the figures to the period but not the trend", () => {
    const db = seedDatabase();
    db.tickets[0].createdAt = new Date(Date.now() - 200 * 86_400_000).toISOString(); // far outside any period
    expect(buildReport(db, 30).count).toBe(5);
    expect(buildReport(db, null).count).toBe(6);
    expect(buildReport(db, 7).trend).toHaveLength(14);
  });

  it("gives an empty database sensible nulls", () => {
    const db = { ...seedDatabase(), tickets: [], comments: [] };
    const r = buildReport(db, 30);
    expect(r.count).toBe(0);
    expect(r.summary.slaCompliance).toBeNull();
    expect(r.categories).toEqual([]);
    expect(r.agents.length).toBeGreaterThan(0); // staff still listed, with zeros
  });
});

describe("formatting", () => {
  it("shows minutes, hours or days, and a dash for nothing", () => {
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(0.5)).toBe("30 min");
    expect(formatDuration(3.456)).toBe("3.5 h");
    expect(formatDuration(47.9)).toBe("47.9 h");
    expect(formatDuration(72)).toBe("3.0 days");
  });

  it("shows whole percentages, and a dash rather than 0% when there is nothing to measure", () => {
    expect(formatPercent(null)).toBe("-");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(2 / 3)).toBe("67%");
    expect(formatPercent(1)).toBe("100%");
  });
});
