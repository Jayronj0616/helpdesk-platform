"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mutate, newId, resetDb } from "@/lib/dataverse/store";
import type { Priority, TicketStatus } from "@/lib/dataverse/types";
import { canApprove, canWorkTickets, currentUser, PERSONA_COOKIE } from "@/lib/session";
import { escalateOverdue, onAssetRequestDecided, onTicketCreated } from "@/lib/flows";

const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
const STATUSES: TicketStatus[] = ["new", "in_progress", "waiting", "resolved", "closed"];

export async function switchPersona(formData: FormData) {
  (await cookies()).set(PERSONA_COOKIE, String(formData.get("userId")), { path: "/" });
  revalidatePath("/", "layout");
}

export async function createTicket(formData: FormData) {
  const user = await currentUser();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority")) as Priority;
  const categoryId = String(formData.get("categoryId"));
  if (!title || !PRIORITIES.includes(priority)) return;

  const number = mutate((db) => {
    const now = new Date().toISOString();
    const ticket = {
      id: newId("t"), number: db.nextTicketNumber++, title, description,
      requesterId: user.id, assigneeId: null, categoryId, priority,
      status: "new" as TicketStatus, assetId: null, createdAt: now, updatedAt: now,
      dueAt: now, resolvedAt: null, escalated: false,
    };
    db.tickets.unshift(ticket);
    onTicketCreated(db, ticket);
    return ticket.number;
  });

  revalidatePath("/", "layout");
  redirect(`/tickets?created=${number}`);
}

export async function updateTicket(formData: FormData) {
  const user = await currentUser();
  if (!canWorkTickets(user)) return;
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as TicketStatus;
  const assigneeId = String(formData.get("assigneeId") ?? "");
  if (!STATUSES.includes(status)) return;

  mutate((db) => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) return;
    t.status = status;
    t.assigneeId = assigneeId || null;
    t.updatedAt = new Date().toISOString();
    t.resolvedAt = status === "resolved" || status === "closed" ? (t.resolvedAt ?? t.updatedAt) : null;
  });
  revalidatePath("/", "layout");
}

export async function createAssetRequest(formData: FormData) {
  const user = await currentUser();
  const assetType = String(formData.get("assetType") ?? "").trim();
  const justification = String(formData.get("justification") ?? "").trim();
  if (!assetType || !justification) return;

  mutate((db) => {
    db.assetRequests.unshift({
      id: newId("r"), assetType, justification, requesterId: user.id,
      status: "pending", decidedById: null, decidedAt: null, createdAt: new Date().toISOString(),
    });
  });
  revalidatePath("/requests");
}

export async function decideRequest(formData: FormData) {
  const user = await currentUser();
  if (!canApprove(user)) return;
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  if (decision !== "approved" && decision !== "rejected") return;

  mutate((db) => {
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
  const user = await currentUser();
  if (!canApprove(user)) return;
  mutate((db) => escalateOverdue(db));
  revalidatePath("/", "layout");
}

export async function resetDemoData() {
  const user = await currentUser();
  if (!canApprove(user)) return;
  resetDb();
  revalidatePath("/", "layout");
}
