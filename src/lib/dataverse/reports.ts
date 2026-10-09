import type { Comment, Database, Ticket, User } from "./types";
import { isOpen, isOverdue } from "./queries";

// Numbers for the reports page. All pure functions over rows, with the current time passed in, so every figure
// can be unit tested with fixed dates. Definitions (also shown on the page, so nobody has to guess):
//  - Resolved: a ticket that is Resolved or Closed and has a resolved time. Reopening clears the resolved time,
//    so a reopened ticket is not counted as resolved until it is resolved again.
//  - Met SLA: resolved at or before its due date. The due date already includes any time spent Waiting on the
//    customer (the clock pauses), so waiting for a customer is never held against the team.
//  - Resolution time: created to resolved, in hours.
//  - First response: created to the first public comment from IT staff, in hours.

export const PERIODS = [
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["all", "All time"],
] as const;

export type PeriodKey = (typeof PERIODS)[number][0];

/** Reads the period from the URL, ignoring anything that is not an option. Default: 30 days. */
export function parsePeriod(value: string | string[] | undefined): { key: PeriodKey; days: number | null } {
  const key = PERIODS.find(([k]) => k === value)?.[0] ?? "30";
  return { key, days: key === "all" ? null : Number(key) };
}

/** Tickets created within the last `days` days (or all of them when `days` is null). */
export function inPeriod(tickets: Ticket[], days: number | null, now = Date.now()): Ticket[] {
  if (days === null) return tickets;
  const since = now - days * 86_400_000;
  return tickets.filter((t) => new Date(t.createdAt).getTime() >= since);
}

const HOUR = 3_600_000;

export const isResolved = (t: Ticket): boolean => (t.status === "resolved" || t.status === "closed") && t.resolvedAt !== null;

export function resolutionHours(t: Ticket): number | null {
  if (!isResolved(t)) return null;
  return (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / HOUR;
}

/** True or false for a resolved ticket, null when it is not resolved yet. */
export function metSla(t: Ticket): boolean | null {
  if (!isResolved(t)) return null;
  return new Date(t.resolvedAt!).getTime() <= new Date(t.dueAt).getTime();
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Hours from creation to the first public comment by IT staff, or null when staff have not replied. */
export function firstResponseHours(ticket: Ticket, comments: Comment[], users: Pick<User, "id" | "role">[]): number | null {
  const staff = new Set(users.filter((u) => u.role !== "employee").map((u) => u.id));
  const created = new Date(ticket.createdAt).getTime();
  const times = comments
    .filter((c) => c.ticketId === ticket.id && c.kind === "comment" && !c.internal && c.authorId !== null && staff.has(c.authorId))
    .map((c) => new Date(c.createdAt).getTime())
    .filter((t) => t >= created);
  return times.length ? (Math.min(...times) - created) / HOUR : null;
}

export interface Stats {
  total: number;
  open: number;
  resolved: number;
  /** open tickets past their due date right now (Waiting tickets are paused, so never counted) */
  breachedOpen: number;
  /** share of resolved tickets that met their SLA, 0 to 1, or null when nothing is resolved */
  slaCompliance: number | null;
  avgResolutionHours: number | null;
  avgRating: number | null;
  ratingCount: number;
}

export function stats(tickets: Ticket[], now = Date.now()): Stats {
  const resolved = tickets.filter(isResolved);
  const sla = resolved.map(metSla);
  const ratings = tickets.filter((t): t is Ticket & { rating: number } => t.rating !== null).map((t) => t.rating);
  return {
    total: tickets.length,
    open: tickets.filter(isOpen).length,
    resolved: resolved.length,
    breachedOpen: tickets.filter((t) => isOverdue(t, now)).length,
    slaCompliance: sla.length ? sla.filter(Boolean).length / sla.length : null,
    avgResolutionHours: mean(resolved.map((t) => resolutionHours(t)!)),
    avgRating: mean(ratings),
    ratingCount: ratings.length,
  };
}

export interface Summary extends Stats {
  medianFirstResponseHours: number | null;
}

export function summarize(tickets: Ticket[], comments: Comment[], users: Pick<User, "id" | "role">[], now = Date.now()): Summary {
  const responses = tickets.map((t) => firstResponseHours(t, comments, users)).filter((h): h is number => h !== null);
  return { ...stats(tickets, now), medianFirstResponseHours: median(responses) };
}

export interface Row extends Stats {
  key: string;
  label: string;
}

/** One row per group, busiest first (then by label so the order is stable). Groups with no tickets are omitted. */
export function breakdown(tickets: Ticket[], keyOf: (t: Ticket) => string, labelOf: (key: string) => string, now = Date.now()): Row[] {
  const groups = new Map<string, Ticket[]>();
  for (const t of tickets) groups.set(keyOf(t), [...(groups.get(keyOf(t)) ?? []), t]);
  return [...groups.entries()]
    .map(([key, ts]) => ({ key, label: labelOf(key), ...stats(ts, now) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/** One row per IT person, including people with no tickets in the period, plus an "Unassigned" row when needed. */
export function byAgent(db: Pick<Database, "users">, tickets: Ticket[], now = Date.now()): Row[] {
  const rows: Row[] = db.users
    .filter((u) => u.role !== "employee")
    .map((u) => ({ key: u.id, label: u.active ? u.name : `${u.name} (deactivated)`, ...stats(tickets.filter((t) => t.assigneeId === u.id), now) }));
  const unassigned = tickets.filter((t) => t.assigneeId === null);
  if (unassigned.length) rows.push({ key: "none", label: "Unassigned", ...stats(unassigned, now) });
  return rows.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export interface DayPoint {
  day: string; // YYYY-MM-DD, UTC
  created: number;
  resolved: number;
}

/** Tickets created and resolved per UTC day for the last `days` days, oldest first, zero filled. */
export function dailyTrend(tickets: Ticket[], days = 14, now = Date.now()): DayPoint[] {
  const keys = Array.from({ length: days }, (_, i) => new Date(now - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
  const points = new Map<string, DayPoint>(keys.map((day) => [day, { day, created: 0, resolved: 0 }]));
  for (const t of tickets) {
    const c = points.get(t.createdAt.slice(0, 10));
    if (c) c.created++;
    if (isResolved(t)) {
      const r = points.get(t.resolvedAt!.slice(0, 10));
      if (r) r.resolved++;
    }
  }
  return keys.map((k) => points.get(k)!);
}

export interface Report {
  count: number;
  summary: Summary;
  agents: Row[];
  categories: Row[];
  priorities: Row[];
  trend: DayPoint[];
}

/** All the figures for one period. The trend always shows the last 14 days, whatever period is chosen. */
export function buildReport(
  db: Pick<Database, "tickets" | "users" | "categories" | "comments">,
  days: number | null,
  now = Date.now(),
): Report {
  const tickets = inPeriod(db.tickets, days, now);
  const categoryName = (id: string) => db.categories.find((c) => c.id === id)?.name ?? "Other";
  const priorityOrder = ["critical", "high", "medium", "low"];
  return {
    count: tickets.length,
    summary: summarize(tickets, db.comments, db.users, now),
    agents: byAgent(db, tickets, now),
    categories: breakdown(tickets, (t) => t.categoryId, categoryName, now),
    priorities: breakdown(tickets, (t) => t.priority, (k) => k[0].toUpperCase() + k.slice(1), now).sort(
      (a, b) => priorityOrder.indexOf(a.key) - priorityOrder.indexOf(b.key),
    ),
    trend: dailyTrend(db.tickets, 14, now),
  };
}

/** "45 min", "3.5 h" or "2.0 days", or "-" when there is nothing to measure. */
export function formatDuration(hours: number | null): string {
  if (hours === null) return "-";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

export const formatPercent = (share: number | null): string => (share === null ? "-" : `${Math.round(share * 100)}%`);
