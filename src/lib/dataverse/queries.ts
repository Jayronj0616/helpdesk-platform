import type { Ticket } from "./types";

export const isOpen = (t: Ticket) => t.status === "new" || t.status === "in_progress" || t.status === "waiting";

export const isOverdue = (t: Ticket) => isOpen(t) && new Date(t.dueAt).getTime() < Date.now();
