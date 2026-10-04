import { describe, expect, it } from "vitest";
import { seedDatabase } from "@/lib/dataverse/seed";
import type { Database, Notification, Ticket } from "@/lib/dataverse/types";
import { KEEP_DAYS, KEEP_MAX, prune, queueMail } from "@/lib/notifications/queue";
import { closeStaleResolved, escalateOverdue, onAssetRequestDecided, onTicketCreated } from "@/lib/flows";
import { reopenTicket } from "@/lib/dataverse/lifecycle";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-20T12:00:00.000Z");

function mail(over: Partial<Notification> = {}): Notification {
  return { id: "n_x", toAddress: "a@example.com", subject: "s", body: "b", ticketId: null, createdAt: new Date(NOW).toISOString(), status: "pending", attempts: 0, sentAt: null, lastError: null, ...over };
}

describe("queueMail", () => {
  it("adds a pending email at the front and returns the line for the flow log", () => {
    const db = seedDatabase();
    const line = queueMail(db, { to: "maria@contoso.test", subject: "Hello", body: "Body", ticketId: "t3" }, NOW);
    expect(line).toBe("Queued email to maria@contoso.test: Hello");
    expect(db.notifications[0]).toMatchObject({ toAddress: "maria@contoso.test", subject: "Hello", body: "Body", ticketId: "t3", status: "pending", attempts: 0, sentAt: null, lastError: null });
    expect(db.notifications[0].createdAt).toBe(new Date(NOW).toISOString());
  });

  it("gives every email its own id and defaults the ticket to none", () => {
    const db = seedDatabase();
    queueMail(db, { to: "a@x.test", subject: "1", body: "" }, NOW);
    queueMail(db, { to: "a@x.test", subject: "2", body: "" }, NOW);
    expect(new Set(db.notifications.map((n) => n.id)).size).toBe(2);
    expect(db.notifications[0].ticketId).toBeNull();
  });
});

describe("prune", () => {
  const withMail = (list: Notification[]): Database => ({ ...seedDatabase(), notifications: list });

  it("always keeps emails still waiting or being retried, however old", () => {
    const old = new Date(NOW - 90 * DAY).toISOString();
    const db = withMail([mail({ id: "p", status: "pending", createdAt: old }), mail({ id: "f", status: "failed", attempts: 2, createdAt: old })]);
    prune(db, NOW);
    expect(db.notifications.map((n) => n.id)).toEqual(["p", "f"]);
  });

  it("drops finished emails older than a week and keeps newer ones", () => {
    const db = withMail([
      mail({ id: "fresh", status: "sent", createdAt: new Date(NOW - (KEEP_DAYS - 1) * DAY).toISOString() }),
      mail({ id: "stale-sent", status: "sent", createdAt: new Date(NOW - (KEEP_DAYS + 1) * DAY).toISOString() }),
      mail({ id: "stale-skipped", status: "skipped", createdAt: new Date(NOW - 30 * DAY).toISOString() }),
      mail({ id: "stale-exhausted", status: "failed", attempts: 5, createdAt: new Date(NOW - 30 * DAY).toISOString() }),
    ]);
    prune(db, NOW);
    expect(db.notifications.map((n) => n.id)).toEqual(["fresh"]);
  });

  it("never keeps more than the cap, newest first", () => {
    const db = withMail(Array.from({ length: KEEP_MAX + 25 }, (_, i) => mail({ id: `n${i}`, status: "sent" })));
    prune(db, NOW);
    expect(db.notifications).toHaveLength(KEEP_MAX);
    expect(db.notifications[0].id).toBe("n0");
  });

  it("queueMail prunes as it goes, so the outbox cannot grow without limit", () => {
    const db = withMail(Array.from({ length: KEEP_MAX }, (_, i) => mail({ id: `old${i}`, status: "sent" })));
    queueMail(db, { to: "a@x.test", subject: "new", body: "" }, NOW);
    expect(db.notifications).toHaveLength(KEEP_MAX);
    expect(db.notifications[0].subject).toBe("new");
  });
});

describe("what each flow queues", () => {
  const mails = (db: Database) => db.notifications.map((n) => `${n.toAddress} | ${n.subject}`);

  function newTicket(db: Database): Ticket {
    const now = new Date().toISOString();
    const t: Ticket = {
      id: "tx", number: 9000, title: "Projector dead", description: "", requesterId: "u1", assigneeId: null, categoryId: "c1", priority: "medium",
      status: "new", assetId: null, createdAt: now, updatedAt: now, dueAt: now, resolvedAt: null, escalated: false,
      rating: null, ratingComment: null, ratedAt: null, waitingSince: null,
    };
    db.tickets.unshift(t);
    return t;
  }

  it("a new ticket emails the agent it was assigned to, with the ticket attached", () => {
    const db = seedDatabase();
    const t = newTicket(db);
    onTicketCreated(db, t);
    expect(mails(db)).toEqual(["ben@contoso.test | Ticket #9000 assigned to you: Projector dead"]);
    expect(db.notifications[0].ticketId).toBe("tx");
    expect(db.flowRuns[0].actions.some((a) => a.startsWith("Queued email to ben@contoso.test"))).toBe(true);
  });

  it("a new ticket with no agent queues nothing", () => {
    const db = seedDatabase();
    db.users = db.users.filter((u) => u.role !== "agent");
    onTicketCreated(db, newTicket(db));
    expect(db.notifications).toEqual([]);
  });

  it("a critical ticket still only emails the agent (the Teams alert is simulated and stays in the log)", () => {
    const db = seedDatabase();
    const t = newTicket(db);
    t.priority = "critical";
    onTicketCreated(db, t);
    expect(db.notifications).toHaveLength(1);
    expect(db.flowRuns[0].actions.some((a) => a.includes("Teams alert") && a.includes("simulated"))).toBe(true);
  });

  it("escalation emails the manager once per escalated ticket", () => {
    const db = seedDatabase();
    expect(escalateOverdue(db)).toBe(1);
    expect(mails(db)).toEqual(["dina@contoso.test | Ticket #1001 breached its SLA"]);
  });

  it("approving, waiting for stock and rejecting each email the requester", () => {
    const approved = seedDatabase();
    approved.assetRequests[0].status = "approved"; // a monitor is in stock
    onAssetRequestDecided(approved, approved.assetRequests[0]);
    expect(mails(approved)).toEqual(["maria@contoso.test | Your Monitor request was approved"]);

    const nostock = seedDatabase();
    nostock.assetRequests[0].status = "approved";
    nostock.assetRequests[0].assetType = "Phone"; // none available
    onAssetRequestDecided(nostock, nostock.assetRequests[0]);
    expect(mails(nostock)).toEqual(["maria@contoso.test | Your Phone request was approved, waiting for stock"]);

    const rejected = seedDatabase();
    rejected.assetRequests[0].status = "rejected";
    onAssetRequestDecided(rejected, rejected.assetRequests[0]);
    expect(mails(rejected)).toEqual(["maria@contoso.test | Your Monitor request was rejected"]);
  });

  it("reopening emails the assignee, or the manager when nobody holds the ticket", () => {
    const db = seedDatabase();
    reopenTicket(db, "u1", "t3", "Still broken.");
    expect(mails(db)).toEqual(["ana@contoso.test | Ticket #1003 was reopened by the requester"]);

    const orphan = seedDatabase();
    orphan.tickets.find((t) => t.id === "t3")!.assigneeId = null;
    reopenTicket(orphan, "u1", "t3", "Still broken.");
    expect(mails(orphan)).toEqual(["dina@contoso.test | Reopened ticket #1003 needs an owner"]);
  });

  it("closing a stale resolved ticket emails the requester", () => {
    const db = seedDatabase();
    expect(closeStaleResolved(db, Date.now() + 30 * DAY)).toBe(1);
    expect(mails(db)).toEqual(["maria@contoso.test | Ticket #1003 was closed"]);
  });

  it("a run that changes nothing queues nothing", () => {
    const db = seedDatabase();
    expect(closeStaleResolved(db)).toBe(0);
    expect(db.notifications).toEqual([]);
  });
});
