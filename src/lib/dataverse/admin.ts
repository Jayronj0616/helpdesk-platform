import type { Asset, AssetStatus, Database, Role } from "./types";
import { ASSET_STATUSES, ROLES } from "./types";
import { addSystemEntry } from "./comments";
import { isOpen } from "./queries";
import { newId } from "./store";

// Rules for the admin and asset-management actions. Pure functions over a Database, called from
// inside mutate(), so they can be unit tested without a server.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Changes a user's role. Managers cannot change their own role (so the last manager cannot lock
 * everyone out). Demoting someone to employee unassigns their open tickets, because employees
 * cannot work tickets, and records that on each ticket.
 */
export function changeUserRole(db: Database, actorId: string, userId: string, role: string): Result<{ unassigned: number }> {
  if (!ROLES.includes(role as Role)) return { ok: false, error: "Choose a valid role." };
  if (actorId === userId) return { ok: false, error: "You cannot change your own role." };
  const user = db.users.find((u) => u.id === userId);
  if (!user) return { ok: false, error: "User not found." };
  const actor = db.users.find((u) => u.id === actorId);
  if (actor?.role !== "manager" || !actor.active) return { ok: false, error: "Only managers can change roles." };
  if (user.role === role) return { ok: true, unassigned: 0 };

  const unassigned = role === "employee" ? unassignOpenTickets(db, user.id, `${actor.name} changed ${user.name}'s role to employee`) : 0;
  user.role = role as Role;
  return { ok: true, unassigned };
}

/** Takes a person off every open ticket they hold, noting why on each one. Resolved and closed tickets keep their history. */
function unassignOpenTickets(db: Database, userId: string, reason: string): number {
  let count = 0;
  for (const t of db.tickets) {
    if (t.assigneeId === userId && isOpen(t)) {
      t.assigneeId = null;
      t.updatedAt = new Date().toISOString();
      addSystemEntry(db, t.id, `${reason}, so this ticket is now unassigned`);
      count++;
    }
  }
  return count;
}

/**
 * Deactivates or reactivates an account. Deactivated people cannot sign in and are never offered as
 * assignees, but their name stays on past tickets and comments. Managers cannot deactivate
 * themselves. The caller must also end the user's sessions (see setUserActiveAction).
 */
export function setUserActive(db: Database, actorId: string, userId: string, active: boolean): Result<{ unassigned: number }> {
  if (actorId === userId) return { ok: false, error: "You cannot deactivate your own account." };
  const actor = db.users.find((u) => u.id === actorId);
  if (actor?.role !== "manager" || !actor.active) return { ok: false, error: "Only managers can do this." };
  const user = db.users.find((u) => u.id === userId);
  if (!user) return { ok: false, error: "User not found." };
  if (user.active === active) return { ok: true, unassigned: 0 };

  const unassigned = active ? 0 : unassignOpenTickets(db, user.id, `${actor.name} deactivated ${user.name}'s account`);
  user.active = active;
  return { ok: true, unassigned };
}

const TAG_RE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface AssetInput {
  tag: string;
  name: string;
  type: string;
  purchasedAt: string;
}

export function createAsset(db: Database, input: AssetInput, today = new Date().toISOString().slice(0, 10)): Result<{ asset: Asset }> {
  const tag = input.tag.trim().toUpperCase();
  const name = input.name.trim();
  let type = input.type.trim();
  if (!TAG_RE.test(tag)) return { ok: false, error: "Asset tag must be 2 to 20 letters, numbers or dashes, for example LT-0042." };
  if (db.assets.some((a) => a.tag === tag)) return { ok: false, error: `Asset tag ${tag} already exists.` };
  if (!name || name.length > 80) return { ok: false, error: "Enter an asset name (up to 80 characters)." };
  if (!type || type.length > 40) return { ok: false, error: "Enter an asset type (up to 40 characters)." };
  // Reuse the spelling of an existing type, so "laptop" and "Laptop" do not become two types.
  type = requestTypes(db).find((t) => t.toLowerCase() === type.toLowerCase()) ?? type;

  const date = input.purchasedAt.trim();
  if (date && (!DATE_RE.test(date) || Number.isNaN(Date.parse(date)))) return { ok: false, error: "Enter the purchase date as YYYY-MM-DD." };

  const asset: Asset = { id: newId("a"), tag, name, type, status: "available", assignedToId: null, purchasedAt: date || today };
  db.assets.push(asset);
  return { ok: true, asset };
}

/** Sets an asset's status and holder. Only "assigned" assets have a holder, so other statuses clear it. */
export function updateAsset(db: Database, assetId: string, status: string, assignedToId: string): Result {
  const asset = db.assets.find((a) => a.id === assetId);
  if (!asset) return { ok: false, error: "Asset not found." };
  if (!ASSET_STATUSES.includes(status as AssetStatus)) return { ok: false, error: "Choose a valid status." };

  if (status === "assigned") {
    if (!db.users.some((u) => u.id === assignedToId)) return { ok: false, error: "Choose who the asset is assigned to." };
    asset.assignedToId = assignedToId;
  } else {
    asset.assignedToId = null;
  }
  asset.status = status as AssetStatus;
  return { ok: true };
}

// Types offered on the request form: the usual equipment plus anything already in the register.
export const DEFAULT_ASSET_TYPES = ["Laptop", "Monitor", "Phone", "Keyboard and mouse", "Headset"];

export function requestTypes(db: Pick<Database, "assets">): string[] {
  const all = new Map<string, string>();
  for (const t of [...DEFAULT_ASSET_TYPES, ...db.assets.map((a) => a.type)]) {
    if (!all.has(t.toLowerCase())) all.set(t.toLowerCase(), t);
  }
  return [...all.values()].sort((a, b) => a.localeCompare(b));
}
