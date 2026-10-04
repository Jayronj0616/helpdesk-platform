"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authenticate, normalizeEmail, registerUser } from "@/lib/auth/credentials";
import { loginLimiter } from "@/lib/auth/rate-limit";
import { endSession, startSession } from "@/lib/session";

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
