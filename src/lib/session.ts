import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "./dataverse/types";
import { createSession, destroySession, getSessionUser, SESSION_DAYS } from "./auth/sessions";

export const SESSION_COOKIE = "session";

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getSessionUser(token) : null;
}

// Pages and server actions call this first; signed-out visitors are sent to the login page.
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const token = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  jar.delete(SESSION_COOKIE);
}

export const canWorkTickets = (u: User) => u.role === "agent" || u.role === "manager";
export const canApprove = (u: User) => u.role === "manager";
