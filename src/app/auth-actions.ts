"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { authenticate, changeOwnPassword, normalizeEmail, registerUser } from "@/lib/auth/credentials";
import { recordAudit } from "@/lib/audit";
import { readDb } from "@/lib/dataverse/store";
import { loginLimiter } from "@/lib/auth/rate-limit";
import { consumeResetToken, createResetToken } from "@/lib/auth/reset";
import { appUrl, passwordResetAvailable, sendMail } from "@/lib/mail";
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
  if (!(await loginLimiter.attempt(key))) return { error: "Too many attempts. Try again in 15 minutes.", values };

  const user = await authenticate(email, password);
  // Same message for unknown email and wrong password, so accounts cannot be enumerated.
  if (!user) return { error: "Invalid email or password.", values };

  await loginLimiter.reset(key);
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
  if (!(await loginLimiter.attempt(key))) return { error: "Too many attempts. Try again in 15 minutes.", values };

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
  if (!(await loginLimiter.attempt(`password|${user.id}`))) return { error: "Too many attempts. Try again in 15 minutes." };

  const result = await changeOwnPassword(
    user.id,
    String(formData.get("current") ?? ""),
    String(formData.get("next") ?? ""),
    token,
  );
  if (!result.ok) return { error: result.error };

  await loginLimiter.reset(`password|${user.id}`);
  await recordAudit({ id: user.id, name: user.name }, "account.password_changed", { detail: "Other devices were signed out" });
  return { message: "Password changed. Your other devices were signed out." };
}

const GENERIC_RESET_MESSAGE = "If an account exists for that email, we have sent a link to reset the password. It works for one hour.";

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!passwordResetAvailable()) return { error: "Password reset is not available here. Ask an administrator to reset your password." };
  const email = String(formData.get("email") ?? "").trim();
  const values = { email };
  if (!email) return { error: "Enter your email address.", values };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await loginLimiter.attempt(`reset-ip|${ip}`))) return { error: "Too many attempts. Try again in 15 minutes.", values };
  // A second limit per address, so one person's inbox cannot be flooded from many IPs. When it trips we still
  // give the normal answer, so the limit does not reveal anything either.
  const allowedForAddress = await loginLimiter.attempt(`reset-email|${normalizeEmail(email)}`);

  const base = appUrl(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
  if (base && allowedForAddress) {
    // after() runs once the response has gone, so the page takes the same time whether or not the account exists.
    after(async () => {
      try {
        const created = await createResetToken(email);
        if (!created) return;
        await sendMail({
          to: created.user.email,
          subject: "Reset your HelpDesk password",
          text: [
            `Hi ${created.user.name},`,
            "",
            "Someone asked to reset the password for your HelpDesk account. To choose a new one, open this link within one hour:",
            "",
            `${base}/reset-password/${created.token}`,
            "",
            "If you did not ask for this, ignore this email. Your password has not changed.",
          ].join("\n"),
        });
      } catch (err) {
        console.error("password reset email failed:", err);
      }
    });
  }
  return { message: GENERIC_RESET_MESSAGE, values };
}

export async function completePasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!passwordResetAvailable()) return { error: "Password reset is not available here." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await loginLimiter.attempt(`reset-use|${ip}`))) return { error: "Too many attempts. Try again in 15 minutes." };

  const result = await consumeResetToken(String(formData.get("token") ?? ""), String(formData.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  // Whose password it was is only known from the link, so look the person up for the record.
  if ("userId" in result) {
    const person = (await readDb(["users"])).users.find((u) => u.id === result.userId);
    if (person) await recordAudit({ id: person.id, name: person.name }, "account.password_reset_by_email", { detail: "Signed out everywhere" });
  }
  redirect("/login?reset=1");
}
