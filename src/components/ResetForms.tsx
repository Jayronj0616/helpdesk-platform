"use client";

import { useActionState } from "react";
import { completePasswordReset, requestPasswordReset } from "@/app/auth-actions";
import { btnCls, inputCls } from "@/components/ui";
import type { FormState } from "@/lib/form-state";

const initial: FormState = {};

function Notice({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.message) return <p role="status" className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{state.message}</p>;
  return null;
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className="space-y-4">
      <Notice state={state} />
      <div>
        <label htmlFor="fp-email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="fp-email" name="email" type="email" required autoComplete="username" defaultValue={state.values?.email} className={inputCls} />
      </div>
      <button className={btnCls} disabled={pending}>{pending ? "Sending..." : "Send reset link"}</button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(completePasswordReset, initial);
  return (
    <form action={action} className="space-y-4">
      <Notice state={state} />
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="rp-password" className="mb-1 block text-sm font-medium">New password (at least 8 characters)</label>
        <input id="rp-password" name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={inputCls} />
      </div>
      <button className={btnCls} disabled={pending}>{pending ? "Saving..." : "Set new password"}</button>
    </form>
  );
}
