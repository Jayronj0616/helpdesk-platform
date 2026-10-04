import { describe, expect, it } from "vitest";
import { seedDatabase } from "@/lib/dataverse/seed";
import { SLA_HOURS, type Database, type Priority, type Ticket } from "@/lib/dataverse/types";
import { closeStaleResolved, escalateOverdue, onAssetRequestDecided, onTicketCreated, runMaintenance } from "@/lib/flows";
import { canReopen } from "@/lib/dataverse/lifecycle";

function newTicket(db: Database, priority: Priority): Ticket {
  const now = new Date().toISOString();
  const t: Ticket = {
    id: "tx", number: 9000, title: "New", description: "", requesterId: "u1", assigneeId: null, categoryId: "c1",
    priority, status: "new", assetId: null, createdAt: now, updatedAt: now, dueAt: now, resolvedAt: null, escalated: false, rating: null, ratingComment: null, ratedAt: null, waitingSince: null,
  };
  db.tickets.unshift(t);
  return t;
}

describe("onTicketCreated", () => {
  it("sets the due date from the priority SLA", () => {
    const db = seedDatabase();
    const t = newTicket(db, "high");
    onTicketCreated(db, t);
    const hours = (new Date(t.dueAt).getTime() - new Date(t.createdAt).getTime()) / 3_600_000;
    expect(hours).toBe(SLA_HOURS.high);
  });

  it("assigns the agent with the fewest open tickets and starts work", () => {
    const db = seedDatabase(); // Ana has 2 open tickets, Ben has 1
    const t = newTicket(db, "medium");
    onTicketCreated(db, t);
    expect(t.assigneeId).toBe("u4");
    expect(t.status).toBe("in_progress");
  });

  it("alerts the manager only for critical tickets", () => {
    const critical = seedDatabase();
    onTicketCreated(critical, newTicket(critical, "critical"));
    expect(critical.flowRuns[0].actions.some((a) => a.includes("Teams alert"))).toBe(true);

    const low = seedDatabase();
    onTicketCreated(low, newTicket(low, "low"));
    expect(low.flowRuns[0].actions.some((a) => a.includes("Teams alert"))).toBe(false);
  });

  it("words the workload note correctly for one and for several tickets", () => {
    const one = seedDatabase(); // Ben (u4) holds one open ticket
    onTicketCreated(one, newTicket(one, "medium"));
    expect(one.flowRuns[0].actions.join(" ")).toContain("Assigned to Ben Lim (1 other open ticket)");

    const none = seedDatabase();
    none.tickets.filter((t) => t.assigneeId === "u4").forEach((t) => (t.assigneeId = null));
    onTicketCreated(none, newTicket(none, "medium"));
    expect(none.flowRuns[0].actions.join(" ")).toContain("(0 other open tickets)");
  });

  it("logs a run and audit entries on the ticket", () => {
    const db = seedDatabase();
    const t = newTicket(db, "medium");
    onTicketCreated(db, t);
    expect(db.flowRuns[0].flow).toBe("When a ticket is created");
    expect(db.comments.filter((c) => c.ticketId === t.id && c.kind === "system").length).toBeGreaterThanOrEqual(2);
  });

  it("never assigns to a deactivated agent", () => {
    const db = seedDatabase(); // Ben (u4) has the fewest open tickets, but is deactivated
    db.users.find((u) => u.id === "u4")!.active = false;
    const t = newTicket(db, "medium");
    onTicketCreated(db, t);
    expect(t.assigneeId).toBe("u3");
  });

  it("leaves the ticket unassigned when there are no agents", () => {
    const db = seedDatabase();
    db.users = db.users.filter((u) => u.role !== "agent");
    const t = newTicket(db, "medium");
    onTicketCreated(db, t);
    expect(t.assigneeId).toBeNull();
    expect(t.status).toBe("new");
  });
});

describe("escalateOverdue", () => {
  it("raises priority of overdue open tickets and marks them escalated", () => {
    const db = seedDatabase();
    const count = escalateOverdue(db);
    const t1 = db.tickets.find((t) => t.number === 1001)!;
    expect(count).toBe(1);
    expect(t1.priority).toBe("critical");
    expect(t1.escalated).toBe(true);
  });

  it("does not escalate the same ticket twice", () => {
    const db = seedDatabase();
    escalateOverdue(db);
    expect(escalateOverdue(db)).toBe(0);
    expect(db.tickets.find((t) => t.number === 1001)!.priority).toBe("critical");
  });

  it("never exceeds critical", () => {
    const db = seedDatabase();
    db.tickets.find((t) => t.number === 1001)!.priority = "critical";
    escalateOverdue(db);
    expect(db.tickets.find((t) => t.number === 1001)!.priority).toBe("critical");
  });

  it("leaves closed and in-SLA tickets alone", () => {
    const db = seedDatabase();
    escalateOverdue(db);
    for (const n of [1002, 1004, 1005, 1006]) expect(db.tickets.find((t) => t.number === n)!.escalated).toBe(false);
  });

  it("skips tickets that are waiting on the customer", () => {
    const db = seedDatabase();
    const t1 = db.tickets.find((t) => t.number === 1001)!; // overdue and in progress
    t1.status = "waiting";
    expect(escalateOverdue(db)).toBe(0);
    expect(t1).toMatchObject({ escalated: false, priority: "high" });
  });

  it("can be run for a given moment", () => {
    const db = seedDatabase();
    const farFuture = Date.now() + 365 * 86_400_000;
    expect(escalateOverdue(db, farFuture)).toBeGreaterThan(1); // everything open is overdue a year from now, except waiting
    expect(db.tickets.find((t) => t.number === 1002)!.escalated).toBe(false); // 1002 is waiting
  });

  it("logs a run even when nothing is overdue", () => {
    const db = seedDatabase();
    escalateOverdue(db);
    escalateOverdue(db);
    expect(db.flowRuns[0].actions).toContain("No overdue tickets found");
  });
});

describe("onAssetRequestDecided", () => {
  function decide(status: "approved" | "rejected", assetType = "Monitor") {
    const db = seedDatabase();
    const req = db.assetRequests[0];
    req.assetType = assetType;
    req.status = status;
    onAssetRequestDecided(db, req);
    return db;
  }

  it("assigns an available asset when approved", () => {
    const db = decide("approved");
    const a = db.assets.find((x) => x.tag === "MN-0001")!;
    expect(a).toMatchObject({ status: "assigned", assignedToId: "u1" });
  });

  it("notes a purchase task when the approved type is out of stock", () => {
    const db = decide("approved", "Phone");
    expect(db.flowRuns[0].actions.some((a) => a.includes("No available Phone"))).toBe(true);
    expect(db.assets.filter((a) => a.assignedToId === "u1" && a.type === "Phone")).toHaveLength(0);
  });

  it("does not touch assets when rejected", () => {
    const db = decide("rejected");
    expect(db.assets.find((x) => x.tag === "MN-0001")!.status).toBe("available");
    expect(db.flowRuns[0].actions[0]).toContain("rejected");
  });
});

describe("closeStaleResolved", () => {
  const NOW = Date.parse("2026-10-20T12:00:00.000Z");
  const daysAgo = (d: number, extraHours = 0) => new Date(NOW - d * 86_400_000 - extraHours * 3_600_000).toISOString();
  const byNumber = (db: Database, n: number) => db.tickets.find((t) => t.number === n)!;

  it("closes tickets resolved for longer than the reopen window, and records why", () => {
    const db = seedDatabase();
    byNumber(db, 1003).resolvedAt = daysAgo(8); // resolved, Maria's
    expect(closeStaleResolved(db, NOW)).toBe(1);
    expect(byNumber(db, 1003).status).toBe("closed");
    expect(db.comments.some((c) => c.ticketId === "t3" && c.kind === "system" && c.body.includes("Flow closed this ticket"))).toBe(true);
  });

  it("leaves a ticket that is exactly at the limit, which can still be reopened", () => {
    const db = seedDatabase();
    byNumber(db, 1003).resolvedAt = daysAgo(7);
    expect(closeStaleResolved(db, NOW)).toBe(0);
    expect(byNumber(db, 1003).status).toBe("resolved");
    expect(canReopen(byNumber(db, 1003), "u1", NOW)).toBe(true);
  });

  it("closes exactly the tickets that can no longer be reopened, so the two rules agree", () => {
    for (const age of [6, 7, 7.01, 8, 30]) {
      const db = seedDatabase();
      const t = byNumber(db, 1003);
      t.resolvedAt = daysAgo(age);
      const reopenable = canReopen(t, "u1", NOW);
      closeStaleResolved(db, NOW);
      expect(t.status === "resolved").toBe(reopenable);
    }
  });

  it("never touches open, closed or already-closed tickets", () => {
    const db = seedDatabase();
    for (const t of db.tickets) t.resolvedAt = daysAgo(30); // old, but only resolved ones count
    const before = db.tickets.map((t) => [t.number, t.status]);
    closeStaleResolved(db, NOW);
    for (const t of db.tickets) {
      const was = before.find(([n]) => n === t.number)![1];
      expect(t.status).toBe(was === "resolved" ? "closed" : was);
    }
  });

  it("logs the run with who started it, and tells the requester", () => {
    const db = seedDatabase();
    byNumber(db, 1003).resolvedAt = daysAgo(9);
    closeStaleResolved(db, NOW, "scheduled");
    expect(db.flowRuns[0]).toMatchObject({ flow: "Close resolved tickets", trigger: "Scheduled run (daily)" });
    expect(db.flowRuns[0].actions.join(" ")).toContain("Sent email to maria@contoso.test: ticket #1003 was closed");
  });

  it("logs a run even when nothing is old enough", () => {
    const db = seedDatabase();
    expect(closeStaleResolved(db)).toBe(0); // the seed resolved ticket is only hours old, as of the real now
    expect(db.flowRuns[0].actions).toEqual(["No resolved tickets are older than 7 days"]);
    expect(db.flowRuns[0].trigger).toContain("Manual run");
  });
});

describe("runMaintenance", () => {
  it("runs escalation and closing, reports both counts, and labels both runs as scheduled", () => {
    const db = seedDatabase();
    const farFuture = Date.now() + 30 * 86_400_000;
    const result = runMaintenance(db, farFuture);
    expect(result.closed).toBe(1); // seeded ticket 1003 has been resolved for far longer than a week
    expect(result.escalated).toBeGreaterThan(0);
    expect(db.flowRuns.slice(0, 2).map((r) => r.trigger)).toEqual(["Scheduled run (daily)", "Scheduled run (hourly)"]);
  });
});
