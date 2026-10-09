import { getDb } from "./dataverse/db";
import { ensureSeeded, newId } from "./dataverse/store";
import type { AuditEntry, Database } from "./dataverse/types";

// The audit log answers "who did what, and when" for the actions that change who can do what, or that change
// shared settings and data. It is append-only: nothing in the app edits or deletes an entry (the demo reset
// deliberately leaves it alone, and records that it ran).
//
// Entries are written in the same database transaction as the change they describe (addAudit, inside mutate),
// except for the few changes made outside it (passwords), which are recorded straight after they succeed
// (recordAudit). The table is never loaded by ordinary pages or saves, so a long history costs nothing.
//
// Never put a password, token or reset link in an entry. Names, roles and counts only.

export const AUDIT_ACTIONS = {
  "user.created": "User created",
  "user.role_changed": "Role changed",
  "user.deactivated": "Account deactivated",
  "user.reactivated": "Account reactivated",
  "user.password_reset": "Password reset by a manager",
  "account.password_changed": "Password changed",
  "account.password_reset_by_email": "Password reset by email",
  "category.added": "Category added",
  "category.renamed": "Category renamed",
  "category.deleted": "Category deleted",
  "asset.added": "Asset added",
  "asset.updated": "Asset updated",
  "flow.escalation_run": "Escalation flow run by hand",
  "flow.close_resolved_run": "Close-resolved flow run by hand",
  "flow.emails_sent": "Queued emails sent by hand",
  "demo.reset": "Demo data reset",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;
export const auditLabel = (action: string) => (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;

export interface AuditActor {
  id: string | null;
  name: string;
}

export interface AuditInput {
  /** what was acted on, for example a person's name or a category */
  target?: string | null;
  /** a short, plain description of what changed */
  detail?: string | null;
}

const clip = (text: string | null | undefined, max: number) => (text ? text.slice(0, max) : null);

function entry(actor: AuditActor, action: AuditAction, input: AuditInput, now: number): AuditEntry {
  return {
    id: newId("a"),
    at: new Date(now).toISOString(),
    actorId: actor.id,
    actorName: actor.name.slice(0, 80), // a copy of the name, so the entry still reads right after a rename or removal
    action,
    targetLabel: clip(input.target, 120),
    detail: clip(input.detail, 300),
  };
}

/** Adds an entry to the change being saved, so it is stored together with it or not at all. */
export function addAudit(db: Pick<Database, "auditLog">, actor: AuditActor, action: AuditAction, input: AuditInput = {}, now = Date.now()): void {
  db.auditLog.push(entry(actor, action, input, now));
}

/** For changes made outside a mutate (passwords): stored straight after the change succeeded. */
export async function recordAudit(actor: AuditActor, action: AuditAction, input: AuditInput = {}, now = Date.now()): Promise<void> {
  await ensureSeeded();
  const e = entry(actor, action, input, now);
  await (await getDb()).execute({
    sql: "INSERT INTO audit_log (id, at, actor_id, actor_name, action, target_label, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [e.id, e.at, e.actorId, e.actorName, e.action, e.targetLabel, e.detail],
  });
}

export const AUDIT_PAGE_SIZE = 25;

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  pages: number;
}

/** One page of entries, newest first, optionally only one kind of action. Page numbers outside the range are clamped. */
export async function readAudit(opts: { page?: number; action?: string | null; perPage?: number } = {}): Promise<AuditPage> {
  await ensureSeeded();
  const client = await getDb();
  const perPage = opts.perPage ?? AUDIT_PAGE_SIZE;
  const action = opts.action && opts.action in AUDIT_ACTIONS ? opts.action : null;
  const where = action ? "WHERE action = ?" : "";
  const args = action ? [action] : [];

  const total = Number((await client.execute({ sql: `SELECT count(*) AS n FROM audit_log ${where}`, args })).rows[0].n);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1) || 1), pages);
  const res = await client.execute({
    sql: `SELECT * FROM audit_log ${where} ORDER BY at DESC, id DESC LIMIT ? OFFSET ?`,
    args: [...args, perPage, (page - 1) * perPage],
  });
  const entries = res.rows.map((r) => ({
    id: String(r.id),
    at: String(r.at),
    actorId: r.actor_id === null ? null : String(r.actor_id),
    actorName: String(r.actor_name),
    action: String(r.action),
    targetLabel: r.target_label === null ? null : String(r.target_label),
    detail: r.detail === null ? null : String(r.detail),
  }));
  return { entries, total, page, pages };
}
