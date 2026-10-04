import { describe, expect, it } from "vitest";
import { seedDatabase } from "@/lib/dataverse/seed";
import { averageRating, canRate, rateTicket } from "@/lib/dataverse/feedback";

const NOW = "2026-10-04T12:00:00.000Z";
const ticket = (db: ReturnType<typeof seedDatabase>, number: number) => db.tickets.find((t) => t.number === number)!;

describe("rateTicket", () => {
  it("lets the requester rate their resolved ticket once, storing a trimmed comment and an audit entry", () => {
    const db = seedDatabase(); // 1003: Maria's resolved ticket, not yet rated
    expect(rateTicket(db, "u1", "t3", 4, "  Quick and polite.  ", NOW)).toEqual({ ok: true });
    expect(ticket(db, 1003)).toMatchObject({ rating: 4, ratingComment: "Quick and polite.", ratedAt: NOW });
    expect(db.comments.some((c) => c.ticketId === "t3" && c.kind === "system" && c.body === "Maria Santos rated this ticket 4 out of 5")).toBe(true);
  });

  it("stores an empty comment as null", () => {
    const db = seedDatabase();
    rateTicket(db, "u1", "t3", 5, "   ", NOW);
    expect(ticket(db, 1003).ratingComment).toBeNull();
  });

  it("allows closed tickets too, but not open ones", () => {
    const db = seedDatabase();
    ticket(db, 1003).status = "closed";
    expect(rateTicket(db, "u1", "t3", 3, "", NOW)).toEqual({ ok: true });
    for (const status of ["new", "in_progress", "waiting"] as const) {
      const open = seedDatabase();
      ticket(open, 1003).status = status;
      expect(rateTicket(open, "u1", "t3", 3, "", NOW)).toMatchObject({ ok: false });
      expect(ticket(open, 1003).rating).toBeNull();
    }
  });

  it("only allows one rating, so the average cannot be gamed", () => {
    const db = seedDatabase();
    expect(rateTicket(db, "u1", "t3", 1, "", NOW)).toEqual({ ok: true });
    expect(rateTicket(db, "u1", "t3", 5, "changed my mind", NOW)).toMatchObject({ ok: false });
    expect(ticket(db, 1003).rating).toBe(1);
    expect(rateTicket(db, "u2", "t4", 1, "", NOW)).toMatchObject({ ok: false }); // 1004 already has a seeded rating
  });

  it("only the requester can rate, and a stranger cannot tell a missing ticket from someone else's", () => {
    const db = seedDatabase();
    const notYours = rateTicket(db, "u2", "t3", 5, "", NOW); // Carlo, on Maria's ticket
    const missing = rateTicket(db, "u2", "no-such-ticket", 5, "", NOW);
    expect(notYours).toEqual(missing);
    expect(rateTicket(db, "u3", "t3", 5, "", NOW)).toMatchObject({ ok: false }); // staff cannot rate for the customer
    expect(ticket(db, 1003).rating).toBeNull();
  });

  it("rejects ratings that are not whole numbers from 1 to 5", () => {
    const db = seedDatabase();
    for (const bad of [0, 6, -1, 2.5, NaN, Infinity]) expect(rateTicket(db, "u1", "t3", bad, "", NOW)).toMatchObject({ ok: false });
    expect(ticket(db, 1003).rating).toBeNull();
  });

  it("rejects a comment over 500 characters", () => {
    const db = seedDatabase();
    expect(rateTicket(db, "u1", "t3", 4, "x".repeat(501), NOW)).toMatchObject({ ok: false });
    expect(rateTicket(db, "u1", "t3", 4, "x".repeat(500), NOW)).toEqual({ ok: true });
  });
});

describe("canRate", () => {
  const db = seedDatabase();
  it("is true only for the requester of a resolved or closed, unrated ticket", () => {
    expect(canRate(ticket(db, 1003), "u1")).toBe(true);
    expect(canRate(ticket(db, 1003), "u2")).toBe(false); // someone else
    expect(canRate(ticket(db, 1001), "u1")).toBe(false); // still open
    expect(canRate(ticket(db, 1004), "u2")).toBe(false); // already rated
  });
});

describe("averageRating", () => {
  it("averages only the tickets that have a rating", () => {
    const db = seedDatabase(); // one seeded rating of 5
    expect(averageRating(db.tickets)).toEqual({ average: 5, count: 1 });
    rateTicket(db, "u1", "t3", 4, "", NOW);
    expect(averageRating(db.tickets)).toEqual({ average: 4.5, count: 2 });
  });

  it("is null when nothing has been rated", () => {
    expect(averageRating(seedDatabase().tickets.map((t) => ({ ...t, rating: null })))).toBeNull();
    expect(averageRating([])).toBeNull();
  });
});
