import type { Database, Ticket } from "./types";
import { addSystemEntry } from "./comments";
import type { Result } from "./admin";

// Customer satisfaction. Only the person who raised a ticket can rate it, only once it is resolved or
// closed, and only once (so a rating cannot be changed to game the average).

export const RATING_VALUES = [1, 2, 3, 4, 5] as const;
export const MAX_RATING_COMMENT = 500;

export function canRate(ticket: Ticket, userId: string): boolean {
  return ticket.requesterId === userId && (ticket.status === "resolved" || ticket.status === "closed") && ticket.rating === null;
}

export function rateTicket(db: Database, userId: string, ticketId: string, rating: number, comment: string, now = new Date().toISOString()): Result {
  const ticket = db.tickets.find((t) => t.id === ticketId);
  const user = db.users.find((u) => u.id === userId);
  // Same answer for "not yours" and "does not exist", so ticket ids cannot be probed.
  if (!ticket || !user || ticket.requesterId !== userId) return { ok: false, error: "Ticket not found." };
  if (ticket.status !== "resolved" && ticket.status !== "closed") return { ok: false, error: "You can rate a ticket once it has been resolved." };
  if (ticket.rating !== null) return { ok: false, error: "This ticket has already been rated." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Choose a rating from 1 to 5." };
  const text = comment.trim();
  if (text.length > MAX_RATING_COMMENT) return { ok: false, error: `Keep the comment under ${MAX_RATING_COMMENT} characters.` };

  ticket.rating = rating;
  ticket.ratingComment = text || null;
  ticket.ratedAt = now;
  addSystemEntry(db, ticket.id, `${user.name} rated this ticket ${rating} out of 5`);
  return { ok: true };
}

/** Average of the ratings that exist, or null when there are none yet. */
export function averageRating(tickets: Ticket[]): { average: number; count: number } | null {
  const rated = tickets.filter((t): t is Ticket & { rating: number } => t.rating !== null);
  if (!rated.length) return null;
  return { average: rated.reduce((sum, t) => sum + t.rating, 0) / rated.length, count: rated.length };
}
