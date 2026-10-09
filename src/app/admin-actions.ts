"use server";

import { revalidatePath } from "next/cache";
import { createAccount, setPassword } from "@/lib/auth/credentials";
import { addCategory, changeUserRole, deleteCategory, renameCategory, setUserActive } from "@/lib/dataverse/admin";
import { destroyUserSessions } from "@/lib/auth/sessions";
import { addAudit, recordAudit } from "@/lib/audit";
import { mutate, readDb } from "@/lib/dataverse/store";
import { ROLES, type Role } from "@/lib/dataverse/types";
import type { FormState } from "@/lib/form-state";
import { canApprove, requireUser } from "@/lib/session";

// Every action here re-checks that the caller is a manager. The page hides the forms from
// other roles, but that is not a security boundary.
async function requireManager() {
  const user = await requireUser();
  if (!canApprove(user)) throw new Error("Only managers can do this.");
  return user;
}

const asActor = (u: { id: string; name: string }) => ({ id: u.id, name: u.name });

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireManager();
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    department: String(formData.get("department") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
  if (!ROLES.includes(values.role as Role)) return { error: "Choose a role.", values };

  const result = await createAccount({ ...values, password: String(formData.get("password") ?? "") }, values.role as Role);
  if (!result.ok) return { error: result.error, values };
  await recordAudit(asActor(actor), "user.created", { target: `${result.user.name} (${result.user.role})`, detail: result.user.email });

  revalidatePath("/admin/users");
  return { message: `Created ${result.user.name} (${result.user.role}).` };
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const actor = await requireManager();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  await mutate((db) => {
    const target = db.users.find((u) => u.id === userId);
    const from = target?.role;
    const r = changeUserRole(db, actor.id, userId, role);
    if (r.ok && target && from !== target.role) {
      const freed = r.unassigned ? `; ${r.unassigned} open ticket${r.unassigned === 1 ? "" : "s"} unassigned` : "";
      addAudit(db, asActor(actor), "user.role_changed", { target: target.name, detail: `${from} to ${target.role}${freed}` });
    }
    return r;
  });
  revalidatePath("/", "layout");
}

export async function setUserActiveAction(formData: FormData): Promise<void> {
  const actor = await requireManager();
  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "1";
  const result = await mutate((db) => {
    const target = db.users.find((u) => u.id === userId);
    const was = target?.active;
    const r = setUserActive(db, actor.id, userId, active);
    if (r.ok && target && was !== target.active) {
      addAudit(db, asActor(actor), target.active ? "user.reactivated" : "user.deactivated", {
        target: target.name,
        detail: r.unassigned ? `${r.unassigned} open ticket${r.unassigned === 1 ? "" : "s"} unassigned` : null,
      });
    }
    return r;
  });
  // Deactivation takes effect immediately: their sessions are removed, and getSessionUser also refuses inactive users.
  if (result.ok && !active) await destroyUserSessions(userId);
  revalidatePath("/", "layout");
}

export async function resetUserPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireManager();
  const userId = String(formData.get("userId") ?? "");
  if (userId === actor.id) return { error: "Use the Account page to change your own password." };

  const result = await setPassword(userId, String(formData.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  const target = (await readDb(["users"])).users.find((u) => u.id === userId);
  await recordAudit(asActor(actor), "user.password_reset", { target: target?.name ?? userId, detail: "The user was signed out everywhere" });
  return { message: "Password changed. The user was signed out everywhere." };
}

export async function addCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireManager();
  const values = { name: String(formData.get("name") ?? "") };
  const result = await mutate((db) => {
    const r = addCategory(db, actor.id, values.name);
    if (r.ok) addAudit(db, asActor(actor), "category.added", { target: r.category.name });
    return r;
  });
  if (!result.ok) return { error: result.error, values };
  revalidatePath("/", "layout");
  return { message: `Added ${result.category.name}.` };
}

export async function renameCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireManager();
  const id = String(formData.get("id") ?? "");
  const values = { name: String(formData.get("name") ?? "") };
  const result = await mutate((db) => {
    const old = db.categories.find((c) => c.id === id)?.name;
    const r = renameCategory(db, actor.id, id, values.name);
    const now = db.categories.find((c) => c.id === id)?.name;
    if (r.ok && old && now && old !== now) addAudit(db, asActor(actor), "category.renamed", { target: now, detail: `from ${old}` });
    return r;
  });
  if (!result.ok) return { error: result.error, values };
  revalidatePath("/", "layout");
  return { message: "Renamed." };
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const actor = await requireManager();
  const id = String(formData.get("id") ?? "");
  await mutate((db) => {
    const name = db.categories.find((c) => c.id === id)?.name;
    const r = deleteCategory(db, actor.id, id);
    if (r.ok && name) addAudit(db, asActor(actor), "category.deleted", { target: name });
    return r;
  });
  revalidatePath("/", "layout");
}
