// Automation flows. Each exported function is one "cloud flow": a trigger plus a list of actions.
// Every run is logged to flowRuns so it shows up in the Flow run history page,
// like the run history in Power Automate.
import { newId } from "../dataverse/store";
import type { Database, Ticket, AssetRequest } from "../dataverse/types";
import { SLA_HOURS } from "../dataverse/types";

function logRun(db: Database, flow: string, trigger: string, actions: string[]) {
  db.flowRuns.unshift({ id: newId("run"), flow, trigger, actions, at: new Date().toISOString() });
  db.flowRuns = db.flowRuns.slice(0, 100);
}

const OPEN: Ticket["status"][] = ["new", "in_progress", "waiting"];

/**
 * Flow 1: "When a ticket is created"
 *  - set SLA due date from priority
 *  - assign the agent with the fewest open tickets
 *  - notify the manager if the ticket is critical
 */
export function onTicketCreated(db: Database, ticket: Ticket) {
  const actions: string[] = [];

  const due = new Date(new Date(ticket.createdAt).getTime() + SLA_HOURS[ticket.priority] * 3_600_000);
  ticket.dueAt = due.toISOString();
  actions.push(`Set SLA due date to ${SLA_HOURS[ticket.priority]}h from creation`);

  const agents = db.users.filter((u) => u.role === "agent");
  const load = (id: string) => db.tickets.filter((t) => t.assigneeId === id && OPEN.includes(t.status)).length;
  const pick = [...agents].sort((a, b) => load(a.id) - load(b.id))[0];
  if (pick) {
    ticket.assigneeId = pick.id;
    ticket.status = "in_progress";
    actions.push(`Assigned to ${pick.name} (${load(pick.id) - 1} other open tickets)`);
    actions.push(`Sent email to ${pick.email}: new ticket #${ticket.number}`);
  }

  if (ticket.priority === "critical") {
    const manager = db.users.find((u) => u.role === "manager");
    if (manager) actions.push(`Sent Teams alert to ${manager.name}: critical ticket #${ticket.number}`);
  }

  logRun(db, "When a ticket is created", `Ticket #${ticket.number}`, actions);
}

/**
 * Flow 2: "Escalate overdue tickets" (scheduled flow, here triggered by a button)
 *  - find open tickets past their SLA that are not yet escalated
 *  - bump priority one level and notify the manager
 */
export function escalateOverdue(db: Database): number {
  const now = Date.now();
  const order: Ticket["priority"][] = ["low", "medium", "high", "critical"];
  const overdue = db.tickets.filter((t) => OPEN.includes(t.status) && !t.escalated && new Date(t.dueAt).getTime() < now);
  const manager = db.users.find((u) => u.role === "manager");
  const actions: string[] = [];

  for (const t of overdue) {
    const next = order[Math.min(order.indexOf(t.priority) + 1, order.length - 1)];
    actions.push(`Ticket #${t.number}: priority ${t.priority} -> ${next}, flagged as escalated`);
    t.priority = next;
    t.escalated = true;
    t.updatedAt = new Date().toISOString();
    if (manager) actions.push(`Sent email to ${manager.email}: ticket #${t.number} breached SLA`);
  }
  if (!overdue.length) actions.push("No overdue tickets found");

  logRun(db, "Escalate overdue tickets", "Manual run (scheduled hourly in production)", actions);
  return overdue.length;
}

/**
 * Flow 3: "When an asset request is decided" (approval flow)
 *  - approved: reserve an available asset of the requested type for the requester
 *  - rejected: notify the requester
 */
export function onAssetRequestDecided(db: Database, req: AssetRequest) {
  const requester = db.users.find((u) => u.id === req.requesterId);
  const actions: string[] = [];

  if (req.status === "approved") {
    const asset = db.assets.find((a) => a.type === req.assetType && a.status === "available");
    if (asset) {
      asset.status = "assigned";
      asset.assignedToId = req.requesterId;
      actions.push(`Assigned ${asset.tag} (${asset.name}) to ${requester?.name}`);
      actions.push(`Sent email to ${requester?.email}: your ${req.assetType} request was approved`);
    } else {
      actions.push(`No available ${req.assetType} in stock; created purchase task for IT`);
      actions.push(`Sent email to ${requester?.email}: approved, waiting for stock`);
    }
  } else {
    actions.push(`Sent email to ${requester?.email}: your ${req.assetType} request was rejected`);
  }

  logRun(db, "When an asset request is decided", `Request ${req.id} ${req.status}`, actions);
}
