"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { authenticate, changeOwnPassword, normalizeEmail, registerUser } from "@/lib/auth/credentials";
import { loginLimiter } from "@/lib/auth/rate-limit";
import type { FormState } from "@/lib/form-state";
import { SESSION_COOKIE, endSession, requireUser, startSession } from "@/lib/session";

export interface AuthState {
  error?: string;
  /** Non-secret values to refill the form with, since React clears it after every submit. Never the password. */
  values?: { name?: string; email?: string; department?: string };
}

async function clientKey(email: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `${ip}|${normalizeEmail(email)}`;
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const values = { email };
  if (!email || !password) return { error: "Enter your email and password.", values };

  const key = await clientKey(email);
  if (!loginLimiter.attempt(key)) return { error: "Too many attempts. Try again in 15 minutes.", values };

  const user = await authenticate(email, password);
  // Same message for unknown email and wrong password, so accounts cannot be enumerated.
  if (!user) return { error: "Invalid email or password.", values };

  loginLimiter.reset(key);
  await startSession(user.id);
  redirect("/");
}

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    department: String(formData.get("department") ?? ""),
  };
  const key = `register|${(await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`;
  if (!loginLimiter.attempt(key)) return { error: "Too many attempts. Try again in 15 minutes.", values };

  const result = await registerUser({ ...values, password: String(formData.get("password") ?? "") });
  if (!result.ok) return { error: result.error, values };

  await startSession(result.user.id);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Same limiter as sign-in: this endpoint also tells an attacker whether a guess of the current password was right.
  if (!loginLimiter.attempt(`password|${user.id}`)) return { error: "Too many attempts. Try again in 15 minutes." };

  const result = await changeOwnPassword(
    user.id,
    String(formData.get("current") ?? ""),
    String(formData.get("next") ?? ""),
    token,
  );
  if (!result.ok) return { error: result.error };

  loginLimiter.reset(`password|${user.id}`);
  return { message: "Password changed. Your other devices were signed out." };
}
