"use server";

import { revalidatePath } from "next/cache";
import { createAccount, setPassword } from "@/lib/auth/credentials";
import { changeUserRole } from "@/lib/dataverse/admin";
import { mutate } from "@/lib/dataverse/store";
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

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireManager();
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    department: String(formData.get("department") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
  if (!ROLES.includes(values.role as Role)) return { error: "Choose a role.", values };

  const result = await createAccount({ ...values, password: String(formData.get("password") ?? "") }, values.role as Role);
  if (!result.ok) return { error: result.error, values };

  revalidatePath("/admin/users");
  return { message: `Created ${result.user.name} (${result.user.role}).` };
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const actor = await requireManager();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  await mutate((db) => changeUserRole(db, actor.id, userId, role));
  revalidatePath("/", "layout");
}

export async function resetUserPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireManager();
  const userId = String(formData.get("userId") ?? "");
  if (userId === actor.id) return { error: "Use the Account page to change your own password." };

  const result = await setPassword(userId, String(formData.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  return { message: "Password changed. The user was signed out everywhere." };
}
