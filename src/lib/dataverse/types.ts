// Table definitions. Each type maps to a Dataverse table in the real Power Platform build
// (see docs/POWER-PLATFORM-BLUEPRINT.md).

export type Role = "employee" | "agent" | "manager";
export type Priority = "low" | "medium" | "high" | "critical";
export type TicketStatus = "new" | "in_progress" | "waiting" | "resolved" | "closed";
export type AssetStatus = "available" | "assigned" | "repair" | "retired";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  /** Deactivated accounts cannot sign in or be assigned tickets, but keep their history. */
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
}

export interface Ticket {
  id: string;
  number: number;
  title: string;
  description: string;
  requesterId: string;
  assigneeId: string | null;
  categoryId: string;
  priority: Priority;
  status: TicketStatus;
  assetId: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  resolvedAt: string | null;
  escalated: boolean;
  /** 1 to 5, given once by the requester after the ticket is resolved. */
  rating: number | null;
  ratingComment: string | null;
  ratedAt: string | null;
  /** Set while the status is Waiting (on the customer): the SLA clock is paused from this moment. */
  waitingSince: string | null;
}

export interface Asset {
  id: string;
  tag: string;
  name: string;
  type: string;
  status: AssetStatus;
  assignedToId: string | null;
  purchasedAt: string;
}

export interface AssetRequest {
  id: string;
  assetType: string;
  justification: string;
  requesterId: string;
  status: RequestStatus;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface FlowRun {
  id: string;
  flow: string;
  trigger: string;
  actions: string[];
  at: string;
}

// kind "system" entries are the audit trail written by actions and flows.
// Internal comments are visible to agents and managers only.
export interface Comment {
  id: string;
  ticketId: string;
  authorId: string | null;
  body: string;
  kind: "comment" | "system";
  internal: boolean;
  createdAt: string;
}

export interface Database {
  nextTicketNumber: number;
  comments: Comment[];
  users: User[];
  categories: Category[];
  tickets: Ticket[];
  assets: Asset[];
  assetRequests: AssetRequest[];
  flowRuns: FlowRun[];
}

export const SLA_HOURS: Record<Priority, number> = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 72,
};

export const TICKET_STATUSES: TicketStatus[] = ["new", "in_progress", "waiting", "resolved", "closed"];
export const ROLES: Role[] = ["employee", "agent", "manager"];
export const ASSET_STATUSES: AssetStatus[] = ["available", "assigned", "repair", "retired"];

// Lowest to highest. Use this for dropdown order and ranking.
export const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
