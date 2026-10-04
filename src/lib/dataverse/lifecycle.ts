import type { Database, Ticket } from "./types";
import { SLA_HOURS } from "./types";
import { addComment, addSystemEntry } from "./comments";
import { onTicketReopened } from "../flows";
import type { Result } from "./admin";

// Reopening: the requester says a resolved ticket is not actually fixed. Closed tickets are final (staff
// close them on purpose), and a very old resolution should be a new ticket, so there is a window.

export const REOPEN_WINDOW_DAYS = 7;
export const MAX_REOPEN_REASON = 1000;

export function canReopen(ticket: Ticket, userId: string, now = Date.now()): boolean {
  if (ticket.requesterId !== userId || ticket.status !== "resolved" || !ticket.resolvedAt) return false;
  return now - new Date(ticket.resolvedAt).getTime() <= REOPEN_WINDOW_DAYS * 86_400_000;
}

export function reopenTicket(db: Database, userId: string, ticketId: string, reason: string, now = new Date()): Result {
  const ticket = db.tickets.find((t) => t.id === ticketId);
  const user = db.users.find((u) => u.id === userId);
  // Same answer for "not yours" and "does not exist", so ticket ids cannot be probed.
  if (!ticket || !user || ticket.requesterId !== userId) return { ok: false, error: "Ticket not found." };
  if (ticket.status === "closed") return { ok: false, error: "This ticket was closed. Please raise a new ticket." };
  if (ticket.status !== "resolved") return { ok: false, error: "Only a resolved ticket can be reopened." };
  if (!canReopen(ticket, userId, now.getTime())) {
    return { ok: false, error: `This ticket was resolved more than ${REOPEN_WINDOW_DAYS} days ago. Please raise a new ticket.` };
  }
  const text = reason.trim();
  if (!text) return { ok: false, error: "Tell us what is still wrong so we can pick it up." };
  if (text.length > MAX_REOPEN_REASON) return { ok: false, error: `Keep it under ${MAX_REOPEN_REASON} characters.` };

  // Back to the person who held it if they are still around, otherwise to the queue.
  const holder = db.users.find((u) => u.id === ticket.assigneeId && u.active && u.role !== "employee");
  ticket.assigneeId = holder?.id ?? null;
  ticket.status = holder ? "in_progress" : "new";
  ticket.resolvedAt = null;
  ticket.escalated = false; // a fresh SLA clock starts now
  ticket.dueAt = new Date(now.getTime() + SLA_HOURS[ticket.priority] * 3_600_000).toISOString();
  ticket.updatedAt = now.toISOString();

  addSystemEntry(db, ticket.id, `${user.name} reopened this ticket`);
  addComment(db, { ticketId: ticket.id, authorId: user.id, body: text, internal: false });
  onTicketReopened(db, ticket);
  return { ok: true };
}
