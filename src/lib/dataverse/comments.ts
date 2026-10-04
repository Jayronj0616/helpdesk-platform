import type { Comment, Database } from "./types";
import { newId } from "./store";

// Audit trail entry shown in a ticket's thread. Always visible to the requester.
export function addSystemEntry(db: Database, ticketId: string, body: string): void {
  db.comments.push({
    id: newId("m"), ticketId, authorId: null, body, kind: "system", internal: false, createdAt: new Date().toISOString(),
  });
}

export function addComment(
  db: Database,
  input: Pick<Comment, "ticketId" | "authorId" | "body" | "internal">,
): void {
  db.comments.push({ id: newId("m"), kind: "comment", createdAt: new Date().toISOString(), ...input });
}

// Employees never see internal notes. Every place that shows comments goes through this.
export function filterVisible(comments: Comment[], canSeeInternal: boolean): Comment[] {
  return comments.filter((c) => canSeeInternal || !c.internal).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function visibleComments(db: Pick<Database, "comments">, ticketId: string, canSeeInternal: boolean): Comment[] {
  return filterVisible(db.comments.filter((c) => c.ticketId === ticketId), canSeeInternal);
}
