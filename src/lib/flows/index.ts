// Automation flows. Each exported function is one "cloud flow": a trigger plus a list of actions.
// Every run is logged to flowRuns so it shows up in the Flow run history page,
// like the run history in Power Automate.
import { newId } from "../dataverse/store";
import { addSystemEntry } from "../dataverse/comments";
import type { Database, Ticket, AssetRequest } from "../dataverse/types";
import { REOPEN_WINDOW_DAYS, SLA_HOURS } from "../dataverse/types";
import { isOverdue } from "../dataverse/queries";
import { queueMail } from "../notifications/queue";

function logRun(db: Database, flow: string, trigger: string, actions: string[]) {
  db.flowRuns.unshift({ id: newId("run"), flow, trigger, actions, at: new Date().toISOString() });
  db.flowRuns = db.flowRuns.slice(0, 100);
}

/** Who started a flow run, shown in the run history. Scheduled runs come from the cron endpoint. */
export type RunSource = "manual" | "scheduled";
const runLabel = (source: RunSource, schedule: string) => (source === "scheduled" ? `Scheduled run (${schedule})` : `Manual run (scheduled ${schedule} in production)`);

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

  const agents = db.users.filter((u) => u.role === "agent" && u.active);
  const load = (id: string) => db.tickets.filter((t) => t.assigneeId === id && OPEN.includes(t.status)).length;
  const pick = [...agents].sort((a, b) => load(a.id) - load(b.id))[0];
  if (pick) {
    ticket.assigneeId = pick.id;
    ticket.status = "in_progress";
    const others = load(pick.id) - 1;
    actions.push(`Assigned to ${pick.name} (${others} other open ticket${others === 1 ? "" : "s"})`);
    actions.push(
      queueMail(db, {
        to: pick.email,
        subject: `Ticket #${ticket.number} assigned to you: ${ticket.title}`,
        body: `Hi ${pick.name},\n\nA new ${ticket.priority} priority ticket was assigned to you: ${ticket.title}.\nIt is due ${ticket.dueAt}.`,
        ticketId: ticket.id,
      }),
    );
    addSystemEntry(db, ticket.id, `Flow auto-assigned this ticket to ${pick.name}`);
  }
  addSystemEntry(db, ticket.id, `Ticket created. SLA due in ${SLA_HOURS[ticket.priority]}h`);

  if (ticket.priority === "critical") {
    const manager = db.users.find((u) => u.role === "manager" && u.active);
    if (manager) actions.push(`Teams alert to ${manager.name} (simulated, Teams is not connected): critical ticket #${ticket.number}`);
  }

  logRun(db, "When a ticket is created", `Ticket #${ticket.number}`, actions);
}

/**
 * Flow 2: "Escalate overdue tickets" (scheduled flow, here triggered by a button)
 *  - find open tickets past their SLA that are not yet escalated
 *  - bump priority one level and notify the manager
 */
export function escalateOverdue(db: Database, now = Date.now(), source: RunSource = "manual"): number {
  const order: Ticket["priority"][] = ["low", "medium", "high", "critical"];
  // isOverdue ignores tickets that are Waiting, because their SLA clock is paused.
  const overdue = db.tickets.filter((t) => !t.escalated && isOverdue(t, now));
  const manager = db.users.find((u) => u.role === "manager" && u.active);
  const actions: string[] = [];

  for (const t of overdue) {
    const next = order[Math.min(order.indexOf(t.priority) + 1, order.length - 1)];
    actions.push(`Ticket #${t.number}: priority ${t.priority} -> ${next}, flagged as escalated`);
    addSystemEntry(db, t.id, `Flow escalated this ticket: priority ${t.priority} to ${next} (SLA breached)`);
    t.priority = next;
    t.escalated = true;
    t.updatedAt = new Date().toISOString();
    if (manager) {
      actions.push(
        queueMail(db, {
          to: manager.email,
          subject: `Ticket #${t.number} breached its SLA`,
          body: `Hi ${manager.name},\n\nTicket #${t.number} (${t.title}) missed its SLA and was escalated to ${next} priority.`,
          ticketId: t.id,
        }),
      );
    }
  }
  if (!overdue.length) actions.push("No overdue tickets found");

  logRun(db, "Escalate overdue tickets", runLabel(source, "hourly"), actions);
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
      if (requester) actions.push(queueMail(db, { to: requester.email, subject: `Your ${req.assetType} request was approved`, body: `Hi ${requester.name},\n\n${asset.name} (${asset.tag}) is now assigned to you.` }));
    } else {
      actions.push(`No available ${req.assetType} in stock; created purchase task for IT`);
      if (requester) actions.push(queueMail(db, { to: requester.email, subject: `Your ${req.assetType} request was approved, waiting for stock`, body: `Hi ${requester.name},\n\nYour request was approved. We have none in stock right now and will be in touch when one is ready.` }));
    }
  } else {
    if (requester) actions.push(queueMail(db, { to: requester.email, subject: `Your ${req.assetType} request was rejected`, body: `Hi ${requester.name},\n\nYour ${req.assetType} request was not approved. Speak to your manager if you would like to know why.` }));
  }

  logRun(db, "When an asset request is decided", `Request ${req.id} ${req.status}`, actions);
}

/**
 * Flow 4: "When a ticket is reopened"
 *  - tell the assignee, or the manager when nobody holds the ticket
 *  The caller has already reset the status and the SLA clock.
 */
export function onTicketReopened(db: Database, ticket: Ticket) {
  const actions: string[] = [`SLA clock restarted: due in ${SLA_HOURS[ticket.priority]}h`];
  const assignee = db.users.find((u) => u.id === ticket.assigneeId && u.active);
  const manager = db.users.find((u) => u.role === "manager" && u.active);
  if (assignee) {
    actions.push(queueMail(db, { to: assignee.email, subject: `Ticket #${ticket.number} was reopened by the requester`, body: `Hi ${assignee.name},\n\nThe requester says "${ticket.title}" is not fixed. The SLA clock has restarted.`, ticketId: ticket.id }));
  } else {
    actions.push(`Ticket #${ticket.number} has no active assignee, so it is back in the new queue`);
    if (manager) actions.push(queueMail(db, { to: manager.email, subject: `Reopened ticket #${ticket.number} needs an owner`, body: `Hi ${manager.name},\n\n"${ticket.title}" was reopened and nobody active holds it. It is back in the new queue.`, ticketId: ticket.id }));
  }
  logRun(db, "When a ticket is reopened", `Ticket #${ticket.number}`, actions);
}

/**
 * Flow 5: "Close resolved tickets" (scheduled)
 *  - a ticket that has stayed Resolved for longer than the reopen window can no longer be reopened, so close it
 *  - tell the requester
 */
export function closeStaleResolved(db: Database, now = Date.now(), source: RunSource = "manual"): number {
  const limit = REOPEN_WINDOW_DAYS * 86_400_000;
  const stale = db.tickets.filter((t) => t.status === "resolved" && t.resolvedAt && now - new Date(t.resolvedAt).getTime() > limit);
  const actions: string[] = [];

  for (const t of stale) {
    const requester = db.users.find((u) => u.id === t.requesterId);
    t.status = "closed";
    t.updatedAt = new Date(now).toISOString();
    addSystemEntry(db, t.id, `Flow closed this ticket: it was resolved more than ${REOPEN_WINDOW_DAYS} days ago with no reply`);
    actions.push(`Closed ticket #${t.number} (resolved ${new Date(t.resolvedAt!).toISOString().slice(0, 10)})`);
    if (requester) actions.push(queueMail(db, { to: requester.email, subject: `Ticket #${t.number} was closed`, body: `Hi ${requester.name},\n\n"${t.title}" was resolved more than ${REOPEN_WINDOW_DAYS} days ago and has now been closed. If you still need help, please raise a new ticket.`, ticketId: t.id }));
  }
  if (!stale.length) actions.push(`No resolved tickets are older than ${REOPEN_WINDOW_DAYS} days`);

  logRun(db, "Close resolved tickets", runLabel(source, "daily"), actions);
  return stale.length;
}

/** What the scheduled job runs: every time-based flow. */
export function runMaintenance(db: Database, now = Date.now(), source: RunSource = "scheduled"): { escalated: number; closed: number } {
  return { escalated: escalateOverdue(db, now, source), closed: closeStaleResolved(db, now, source) };
}
