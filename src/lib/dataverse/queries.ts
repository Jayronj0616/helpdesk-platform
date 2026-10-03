import type { Database, Priority, Ticket, TicketStatus } from "./types";

export const isOpen = (t: Ticket) => t.status === "new" || t.status === "in_progress" || t.status === "waiting";

export const isOverdue = (t: Ticket) => isOpen(t) && new Date(t.dueAt).getTime() < Date.now();

export interface TicketFilters {
  q?: string;
  status?: TicketStatus;
  priority?: Priority;
  categoryId?: string;
  /** a user id, or "none" for unassigned */
  assignee?: string;
  overdue?: boolean;
  sort?: "newest" | "oldest" | "due" | "priority";
}

const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2, critical: 3 };

// Search matches the ticket number, title, description and requester name.
export function filterTickets(db: Database, tickets: Ticket[], f: TicketFilters): Ticket[] {
  const q = f.q?.trim().toLowerCase().replace(/^#/, "");
  const out = tickets.filter((t) => {
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.assignee === "none" ? t.assigneeId !== null : f.assignee && t.assigneeId !== f.assignee) return false;
    if (f.overdue && !isOverdue(t)) return false;
    if (q) {
      const requester = db.users.find((u) => u.id === t.requesterId)?.name.toLowerCase() ?? "";
      const hay = `${t.number} ${t.title} ${t.description} ${requester}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const by = {
    newest: (a: Ticket, b: Ticket) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a: Ticket, b: Ticket) => a.createdAt.localeCompare(b.createdAt),
    due: (a: Ticket, b: Ticket) => a.dueAt.localeCompare(b.dueAt),
    priority: (a: Ticket, b: Ticket) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
  }[f.sort ?? "newest"];
  return out.sort(by);
}
