import type { Comment, Database } from "./types";
import { newId } from "./store";

/**
 * The time to stamp on a new entry for a ticket: now, but never at or before the ticket's latest entry. Entries
 * made in the same millisecond (a status change and the SLA note that goes with it) would otherwise tie, and
 * the thread would order them by random id instead of by what happened first.
 */
function nextTimestamp(db: Database, ticketId: string): string {
  let at = Date.now();
  for (const c of db.comments) {
    if (c.ticketId !== ticketId) continue;
    const t = new Date(c.createdAt).getTime();
    if (t >= at) at = t + 1;
  }
  return new Date(at).toISOString();
}

// Audit trail entry shown in a ticket's thread. Always visible to the requester.
export function addSystemEntry(db: Database, ticketId: string, body: string): void {
  db.comments.push({
    id: newId("m"), ticketId, authorId: null, body, kind: "system", internal: false, createdAt: nextTimestamp(db, ticketId),
  });
}

export function addComment(
  db: Database,
  input: Pick<Comment, "ticketId" | "authorId" | "body" | "internal">,
): void {
  db.comments.push({ id: newId("m"), kind: "comment", createdAt: nextTimestamp(db, input.ticketId), ...input });
}

// Employees never see internal notes. Every place that shows comments goes through this.
export function filterVisible(comments: Comment[], canSeeInternal: boolean): Comment[] {
  return comments.filter((c) => canSeeInternal || !c.internal).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function visibleComments(db: Pick<Database, "comments">, ticketId: string, canSeeInternal: boolean): Comment[] {
  return filterVisible(db.comments.filter((c) => c.ticketId === ticketId), canSeeInternal);
}
