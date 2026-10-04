"use client";

import { useActionState } from "react";
import { login, register, type AuthState } from "@/app/auth-actions";
import { btnCls, inputCls } from "@/components/ui";

const initial: AuthState = {};

function ErrorText({ error }: { error?: string }) {
  return error ? <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className="space-y-4">
      <ErrorText error={state.error} />
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" defaultValue={state.values?.email} className={inputCls} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className={inputCls} />
      </div>
      <button className={btnCls} disabled={pending}>{pending ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, initial);
  return (
    <form action={action} className="space-y-4">
      <ErrorText error={state.error} />
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Full name</label>
        <input id="name" name="name" defaultValue={state.values?.name} required maxLength={80} autoComplete="name" className={inputCls} />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" defaultValue={state.values?.email} required maxLength={120} autoComplete="username" className={inputCls} />
      </div>
      <div>
        <label htmlFor="department" className="mb-1 block text-sm font-medium">Department</label>
        <input id="department" name="department" defaultValue={state.values?.department} maxLength={60} placeholder="e.g. Finance" className={inputCls} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password (at least 8 characters)</label>
        <input id="password" name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={inputCls} />
      </div>
      <button className={btnCls} disabled={pending}>{pending ? "Creating account..." : "Create account"}</button>
    </form>
  );
}
