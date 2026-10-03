import { describe, expect, it } from "vitest";
import { seedDatabase } from "@/lib/dataverse/seed";
import { SLA_HOURS, type Database, type Priority, type Ticket } from "@/lib/dataverse/types";
import { escalateOverdue, onAssetRequestDecided, onTicketCreated } from "@/lib/flows";

function newTicket(db: Database, priority: Priority): Ticket {
  const now = new Date().toISOString();
  const t: Ticket = {
    id: "tx", number: 9000, title: "New", description: "", requesterId: "u1", assigneeId: null, categoryId: "c1",
    priority, status: "new", assetId: null, createdAt: now, updatedAt: now, dueAt: now, resolvedAt: null, escalated: false,
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

  it("logs a run and audit entries on the ticket", () => {
    const db = seedDatabase();
    const t = newTicket(db, "medium");
    onTicketCreated(db, t);
    expect(db.flowRuns[0].flow).toBe("When a ticket is created");
    expect(db.comments.filter((c) => c.ticketId === t.id && c.kind === "system").length).toBeGreaterThanOrEqual(2);
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
