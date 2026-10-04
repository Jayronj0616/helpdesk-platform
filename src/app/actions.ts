"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mutate, newId, resetDb } from "@/lib/dataverse/store";
import { PRIORITIES, type Priority, type TicketStatus } from "@/lib/dataverse/types";
import { DEMO_MODE } from "@/lib/config";
import { canApprove, canWorkTickets, requireUser } from "@/lib/session";
import { escalateOverdue, onAssetRequestDecided, onTicketCreated } from "@/lib/flows";
import { addComment, addSystemEntry } from "@/lib/dataverse/comments";
import { label } from "@/components/ui";

const STATUSES: TicketStatus[] = ["new", "in_progress", "waiting", "resolved", "closed"];

export async function createTicket(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const description = String(formData.get("description") ?? "").trim().slice(0, 4000);
  const priority = String(formData.get("priority")) as Priority;
  const categoryId = String(formData.get("categoryId"));
  if (!title || !PRIORITIES.includes(priority)) return;
  const requestedAsset = String(formData.get("assetId") ?? "");

  const number = await mutate((db) => {
    if (!db.categories.some((c) => c.id === categoryId)) return null;
    const now = new Date().toISOString();
    // Only link an asset the requester is allowed to reference.
    const asset = db.assets.find((a) => a.id === requestedAsset);
    const assetId = asset && (canWorkTickets(user) || asset.assignedToId === user.id) ? asset.id : null;
    const ticket = {
      id: newId("t"), number: db.nextTicketNumber++, title, description,
      requesterId: user.id, assigneeId: null, categoryId, priority,
      status: "new" as TicketStatus, assetId, createdAt: now, updatedAt: now,
      dueAt: now, resolvedAt: null, escalated: false,
    };
    db.tickets.unshift(ticket);
    onTicketCreated(db, ticket);
    return ticket.number;
  });

  if (number === null) return;
  revalidatePath("/", "layout");
  redirect(`/tickets?created=${number}`);
}

export async function updateTicket(formData: FormData) {
  const user = await requireUser();
  if (!canWorkTickets(user)) return;
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as TicketStatus;
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  if (!STATUSES.includes(status)) return;

  await mutate((db) => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) return;
    // Only IT staff can be assignees; ignore anything else rather than store a bad link.
    const assignee = db.users.find((u) => u.id === assigneeId && u.role !== "employee");
    const nextAssigneeId = assignee?.id ?? null;
    const who = (uid: string | null) => db.users.find((u) => u.id === uid)?.name ?? "Unassigned";
    if (t.status !== status) addSystemEntry(db, t.id, `${user.name} changed status from ${label(t.status)} to ${label(status)}`);
    if (t.assigneeId !== nextAssigneeId) {
      addSystemEntry(db, t.id, `${user.name} changed assignee from ${who(t.assigneeId)} to ${who(nextAssigneeId)}`);
    }
    // The form only sends assetId for staff; ignore unknown ids rather than store a dangling link.
    if (formData.has("assetId")) {
      const asset = db.assets.find((a) => a.id === assetId);
      const nextAssetId = asset?.id ?? null;
      if (t.assetId !== nextAssetId) {
        const tag = (aid: string | null) => db.assets.find((a) => a.id === aid)?.tag ?? "none";
        addSystemEntry(db, t.id, `${user.name} changed related asset from ${tag(t.assetId)} to ${tag(nextAssetId)}`);
        t.assetId = nextAssetId;
      }
    }
    t.status = status;
    t.assigneeId = nextAssigneeId;
    t.updatedAt = new Date().toISOString();
    t.resolvedAt = status === "resolved" || status === "closed" ? (t.resolvedAt ?? t.updatedAt) : null;
  });
  revalidatePath("/", "layout");
}

export async function addTicketComment(formData: FormData) {
  const user = await requireUser();
  const ticketId = String(formData.get("ticketId"));
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!body) return;
  // Only IT staff can write internal notes.
  const internal = canWorkTickets(user) && formData.get("internal") === "on";

  await mutate((db) => {
    const t = db.tickets.find((x) => x.id === ticketId);
    // Employees can only comment on their own tickets.
    if (!t || (!canWorkTickets(user) && t.requesterId !== user.id)) return;
    addComment(db, { ticketId, authorId: user.id, body, internal });
    t.updatedAt = new Date().toISOString();
  });
  revalidatePath(`/tickets/${ticketId}`);
}

export async function createAssetRequest(formData: FormData) {
  const user = await requireUser();
  const assetType = String(formData.get("assetType") ?? "").trim().slice(0, 40);
  const justification = String(formData.get("justification") ?? "").trim().slice(0, 1000);
  if (!assetType || !justification) return;

  await mutate((db) => {
    // Only request types that exist in the register.
    if (!db.assets.some((a) => a.type === assetType)) return;
    db.assetRequests.unshift({
      id: newId("r"), assetType, justification, requesterId: user.id,
      status: "pending", decidedById: null, decidedAt: null, createdAt: new Date().toISOString(),
    });
  });
  revalidatePath("/requests");
}

export async function decideRequest(formData: FormData) {
  const user = await requireUser();
  if (!canApprove(user)) return;
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  if (decision !== "approved" && decision !== "rejected") return;

  await mutate((db) => {
    const req = db.assetRequests.find((r) => r.id === id);
    if (!req || req.status !== "pending") return;
    req.status = decision;
    req.decidedById = user.id;
    req.decidedAt = new Date().toISOString();
    onAssetRequestDecided(db, req);
  });
  revalidatePath("/", "layout");
}

export async function runEscalation() {
  const user = await requireUser();
  if (!canApprove(user)) return;
  await mutate((db) => escalateOverdue(db));
  revalidatePath("/", "layout");
}

// Demo only: wipes tickets, assets and requests back to the seed data and deletes self-registered users.
export async function resetDemoData() {
  const user = await requireUser();
  if (!DEMO_MODE || !canApprove(user)) return;
  await resetDb();
  revalidatePath("/", "layout");
}
