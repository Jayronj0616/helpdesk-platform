import { PRIORITIES, TICKET_STATUSES, type Database, type Priority, type Ticket, type TicketStatus } from "./types";

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

// Tickets created per UTC day for the last `days` days, oldest first, zero-filled.
export function ticketsPerDay(tickets: Ticket[], days = 7, now = Date.now()): { day: string; count: number }[] {
  const keys = Array.from({ length: days }, (_, i) => new Date(now - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const t of tickets) {
    const k = t.createdAt.slice(0, 10);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  return keys.map((day) => ({ day, count: counts.get(day)! }));
}

export const PAGE_SIZE = 10;

// Clamps the requested page into range so a stale link never shows an empty page.
export function paginate<T>(items: T[], requestedPage: number, pageSize = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pages);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pages, total: items.length };
}

export const SORTS = [
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
  ["due", "Due soonest"],
  ["priority", "Highest priority"],
] as const;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => allowed.find((a) => a === v);

/** Turns URL query values into filters, ignoring anything that is not a valid option. */
export function parseTicketFilters(params: Record<string, string | string[] | undefined>, db: Pick<Database, "categories">): TicketFilters {
  return {
    q: one(params.q),
    status: pick(one(params.status), TICKET_STATUSES),
    priority: pick(one(params.priority), PRIORITIES),
    categoryId: db.categories.find((c) => c.id === one(params.category))?.id,
    assignee: one(params.assignee),
    overdue: one(params.overdue) === "1",
    sort: pick(one(params.sort), SORTS.map((s) => s[0])),
  };
}

export const hasFilters = (f: TicketFilters) => Boolean(f.q || f.status || f.priority || f.categoryId || f.assignee || f.overdue);

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
