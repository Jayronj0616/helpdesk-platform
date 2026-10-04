import type { Database, Notification } from "../dataverse/types";
import { newId } from "../dataverse/store";

// The outbox half of the notification system. It only edits the Database object a flow is working on, so the
// email is saved or discarded together with whatever caused it: a change that rolls back never sends mail.
// Delivery happens afterwards, in ./deliver.

export const KEEP_DAYS = 7;
export const KEEP_MAX = 200;

export interface NotificationInput {
  to: string;
  subject: string;
  body: string;
  ticketId?: string | null;
}

/** Adds an email to the outbox and returns the line a flow writes in its run log. */
export function queueMail(db: Database, input: NotificationInput, now = Date.now()): string {
  const n: Notification = {
    id: newId("n"),
    toAddress: input.to,
    subject: input.subject,
    body: input.body,
    ticketId: input.ticketId ?? null,
    createdAt: new Date(now).toISOString(),
    status: "pending",
    attempts: 0,
    sentAt: null,
    lastError: null,
  };
  db.notifications.unshift(n);
  prune(db, now);
  return `Queued email to ${input.to}: ${input.subject}`;
}

/**
 * The outbox is rewritten on every save, so it must not grow forever. Anything still waiting to go out, or
 * being retried, is always kept; finished ones are kept for a week, and never more than KEEP_MAX in total.
 */
export function prune(db: Database, now = Date.now()): void {
  const cutoff = now - KEEP_DAYS * 86_400_000;
  const live = (n: Notification) => n.status === "pending" || (n.status === "failed" && n.attempts < MAX_ATTEMPTS);
  db.notifications = db.notifications.filter((n) => live(n) || new Date(n.createdAt).getTime() >= cutoff).slice(0, KEEP_MAX);
}

export const MAX_ATTEMPTS = 5;
