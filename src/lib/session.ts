import { cookies } from "next/headers";
import { readDb } from "./dataverse/store";
import type { User } from "./dataverse/types";

const COOKIE = "persona";

// Stand-in for sign-in. Like User() in Power Fx, the current user decides what they can see
// and do. The persona switcher in the nav bar lets you test each security role.
export async function currentUser(): Promise<User> {
  const db = readDb();
  const id = (await cookies()).get(COOKIE)?.value;
  return db.users.find((u) => u.id === id) ?? db.users[0];
}

export const PERSONA_COOKIE = COOKIE;

export const canWorkTickets = (u: User) => u.role === "agent" || u.role === "manager";
export const canApprove = (u: User) => u.role === "manager";
