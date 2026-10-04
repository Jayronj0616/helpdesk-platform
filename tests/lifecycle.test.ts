import { describe, expect, it } from "vitest";
import { seedDatabase } from "@/lib/dataverse/seed";
import { REOPEN_WINDOW_DAYS, canReopen, reopenTicket } from "@/lib/dataverse/lifecycle";
import { SLA_HOURS } from "@/lib/dataverse/types";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const hoursBefore = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

// Maria's ticket 1003 is resolved, low priority, assigned to Ana. Pin its resolution time to 40 hours before NOW.
function setup() {
  const db = seedDatabase();
  const t = db.tickets.find((x) => x.number === 1003)!;
  t.resolvedAt = hoursBefore(40);
  return { db, t };
}

describe("reopenTicket", () => {
  it("puts a resolved ticket back with its assignee, restarts the SLA clock and clears the resolved time", () => {
    const { db, t } = setup();
    t.escalated = true;
    expect(reopenTicket(db, "u1", "t3", "  It happened again this morning.  ", NOW)).toEqual({ ok: true });
    expect(t).toMatchObject({ status: "in_progress", assigneeId: "u3", resolvedAt: null, escalated: false });
    expect(t.dueAt).toBe(new Date(NOW.getTime() + SLA_HOURS.low * 3_600_000).toISOString());
    expect(t.updatedAt).toBe(NOW.toISOString());
  });

  it("records the reason as a public comment from the requester, plus an audit entry", () => {
    const { db } = setup();
    reopenTicket(db, "u1", "t3", "It happened again this morning.", NOW);
    const mine = db.comments.filter((c) => c.ticketId === "t3");
    expect(mine.some((c) => c.kind === "comment" && c.authorId === "u1" && !c.internal && c.body === "It happened again this morning.")).toBe(true);
    expect(mine.some((c) => c.kind === "system" && c.body === "Maria Santos reopened this ticket")).toBe(true);
  });

  it("runs the reopened flow and tells the assignee", () => {
    const { db } = setup();
    reopenTicket(db, "u1", "t3", "Still broken.", NOW);
    expect(db.flowRuns[0]).toMatchObject({ flow: "When a ticket is reopened", trigger: "Ticket #1003" });
    expect(db.flowRuns[0].actions.join(" ")).toContain("Sent email to ana@contoso.test");
  });

  it("sends it to the new queue and tells the manager when the assignee is gone", () => {
    const { db, t } = setup();
    db.users.find((u) => u.id === "u3")!.active = false;
    reopenTicket(db, "u1", "t3", "Still broken.", NOW);
    expect(t).toMatchObject({ status: "new", assigneeId: null });
    expect(db.flowRuns[0].actions.join(" ")).toContain("Sent email to dina@contoso.test");
  });

  it("sends it to the new queue when it was never assigned, or the assignee is no longer staff", () => {
    const a = setup();
    a.t.assigneeId = null;
    reopenTicket(a.db, "u1", "t3", "Still broken.", NOW);
    expect(a.t).toMatchObject({ status: "new", assigneeId: null });

    const b = setup();
    b.db.users.find((u) => u.id === "u3")!.role = "employee";
    reopenTicket(b.db, "u1", "t3", "Still broken.", NOW);
    expect(b.t).toMatchObject({ status: "new", assigneeId: null });
  });

  it("only the requester can reopen, and the answer does not reveal whether the ticket exists", () => {
    const { db, t } = setup();
    const notYours = reopenTicket(db, "u2", "t3", "Not mine.", NOW);
    expect(notYours).toEqual(reopenTicket(db, "u2", "no-such-ticket", "x", NOW));
    expect(reopenTicket(db, "u3", "t3", "I am staff.", NOW)).toMatchObject({ ok: false });
    expect(t.status).toBe("resolved");
  });

  it("refuses closed tickets (final), open tickets, and a missing reason", () => {
    const closed = setup();
    closed.t.status = "closed";
    const r = reopenTicket(closed.db, "u1", "t3", "Please.", NOW);
    expect(r.ok === false && r.error).toContain("raise a new ticket");

    for (const status of ["new", "in_progress", "waiting"] as const) {
      const open = setup();
      open.t.status = status;
      expect(reopenTicket(open.db, "u1", "t3", "Please.", NOW)).toMatchObject({ ok: false });
    }

    const { db, t } = setup();
    expect(reopenTicket(db, "u1", "t3", "   ", NOW)).toMatchObject({ ok: false });
    expect(reopenTicket(db, "u1", "t3", "x".repeat(1001), NOW)).toMatchObject({ ok: false });
    expect(t.status).toBe("resolved");
  });

  it("refuses once the window has passed, but allows the last moment of it", () => {
    const late = setup();
    late.t.resolvedAt = hoursBefore(REOPEN_WINDOW_DAYS * 24 + 1);
    const r = reopenTicket(late.db, "u1", "t3", "Still broken.", NOW);
    expect(r.ok === false && r.error).toContain("more than 7 days ago");

    const edge = setup();
    edge.t.resolvedAt = hoursBefore(REOPEN_WINDOW_DAYS * 24);
    expect(reopenTicket(edge.db, "u1", "t3", "Still broken.", NOW)).toEqual({ ok: true });
  });

  it("cannot be done twice in a row", () => {
    const { db } = setup();
    expect(reopenTicket(db, "u1", "t3", "Still broken.", NOW)).toEqual({ ok: true });
    expect(reopenTicket(db, "u1", "t3", "Still broken again.", NOW)).toMatchObject({ ok: false });
  });

  it("leaves a rating in place, so one resolution cannot be rated twice", () => {
    const { db, t } = setup();
    t.rating = 4;
    reopenTicket(db, "u1", "t3", "Still broken.", NOW);
    expect(t.rating).toBe(4);
  });
});

describe("canReopen", () => {
  it("is true only for the requester of a recently resolved ticket", () => {
    const { t } = setup();
    expect(canReopen(t, "u1", NOW.getTime())).toBe(true);
    expect(canReopen(t, "u2", NOW.getTime())).toBe(false);
    expect(canReopen({ ...t, status: "closed" }, "u1", NOW.getTime())).toBe(false);
    expect(canReopen({ ...t, status: "in_progress" }, "u1", NOW.getTime())).toBe(false);
    expect(canReopen({ ...t, resolvedAt: null }, "u1", NOW.getTime())).toBe(false);
    expect(canReopen(t, "u1", NOW.getTime() + 10 * 86_400_000)).toBe(false);
  });
});
