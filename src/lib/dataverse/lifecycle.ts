import type { Database, Ticket, TicketStatus } from "./types";
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
  ticket.waitingSince = null;
  ticket.escalated = false; // a fresh SLA clock starts now
  ticket.dueAt = new Date(now.getTime() + SLA_HOURS[ticket.priority] * 3_600_000).toISOString();
  ticket.updatedAt = now.toISOString();

  addSystemEntry(db, ticket.id, `${user.name} reopened this ticket`);
  addComment(db, { ticketId: ticket.id, authorId: user.id, body: text, internal: false });
  onTicketReopened(db, ticket);
  return { ok: true };
}

const hours = (ms: number) => `${Math.round(ms / 360_000) / 10}h`;

/**
 * Moves a ticket to a new status and keeps its SLA clock honest. While a ticket is Waiting on the
 * customer the clock is paused: entering Waiting records when, and leaving Waiting for another open
 * status pushes the due date back by the time spent waiting. Resolving or closing from Waiting just
 * ends the pause. Returns a short note for the ticket's history when the clock paused or resumed.
 */
export function applyStatusChange(ticket: Ticket, next: TicketStatus, now = new Date()): string | null {
  if (ticket.status === next) return null;
  let note: string | null = null;

  if (ticket.status === "waiting" && ticket.waitingSince) {
    if (next === "new" || next === "in_progress") {
      const paused = now.getTime() - new Date(ticket.waitingSince).getTime();
      ticket.dueAt = new Date(new Date(ticket.dueAt).getTime() + Math.max(0, paused)).toISOString();
      note = `SLA clock resumed: due date moved ${hours(paused)} later for the time spent waiting`;
    }
    ticket.waitingSince = null;
  }
  if (next === "waiting") {
    ticket.waitingSince = now.toISOString();
    note = "SLA clock paused while waiting for the customer";
  }

  ticket.status = next;
  ticket.updatedAt = now.toISOString();
  ticket.resolvedAt = next === "resolved" || next === "closed" ? (ticket.resolvedAt ?? ticket.updatedAt) : null;
  return note;
}
