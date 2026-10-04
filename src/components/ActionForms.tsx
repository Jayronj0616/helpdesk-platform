"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/auth-actions";
import { createUserAction, resetUserPasswordAction } from "@/app/admin-actions";
import { createAssetAction, rateTicketAction, updateProfileAction } from "@/app/actions";
import { btnCls, btnGhostCls, inputCls, label } from "@/components/ui";
import { ROLES } from "@/lib/dataverse/types";
import type { FormState } from "@/lib/form-state";

const initial: FormState = {};

function Notice({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.message) return <p role="status" className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{state.message}</p>;
  return null;
}

function Field({ id, text, children }: { id: string; text: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{text}</label>
      {children}
    </div>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, initial);
  const v = state.values;
  return (
    <form action={action} className="space-y-3">
      <Notice state={state} />
      <Field id="cu-name" text="Full name"><input id="cu-name" name="name" required maxLength={80} defaultValue={v?.name} className={inputCls} /></Field>
      <Field id="cu-email" text="Email"><input id="cu-email" name="email" type="email" required maxLength={120} defaultValue={v?.email} className={inputCls} /></Field>
      <Field id="cu-dept" text="Department"><input id="cu-dept" name="department" maxLength={60} defaultValue={v?.department} className={inputCls} /></Field>
      <Field id="cu-role" text="Role">
        <select id="cu-role" name="role" defaultValue={v?.role ?? "agent"} className={inputCls}>
          {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </select>
      </Field>
      <Field id="cu-pw" text="Temporary password (at least 8 characters)">
        <input id="cu-pw" name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={inputCls} />
      </Field>
      <button className={btnCls} disabled={pending}>{pending ? "Creating..." : "Create user"}</button>
    </form>
  );
}

export function ResetPasswordForm({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState(resetUserPasswordAction, initial);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-indigo-700">Reset password</summary>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <input
          name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password"
          aria-label={`New password for ${name}`} placeholder="New password" className={`${inputCls} max-w-xs`}
        />
        <button className={btnGhostCls} disabled={pending}>{pending ? "Saving..." : "Set password"}</button>
        <div className="w-full"><Notice state={state} /></div>
      </form>
    </details>
  );
}

export function AddAssetForm({ types }: { types: string[] }) {
  const [state, action, pending] = useActionState(createAssetAction, initial);
  const v = state.values;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <div className="sm:col-span-2 lg:col-span-5"><Notice state={state} /></div>
      <Field id="as-tag" text="Asset tag"><input id="as-tag" name="tag" required maxLength={20} placeholder="LT-0042" defaultValue={v?.tag} className={inputCls} /></Field>
      <Field id="as-name" text="Name"><input id="as-name" name="name" required maxLength={80} defaultValue={v?.name} className={inputCls} /></Field>
      <Field id="as-type" text="Type">
        <input id="as-type" name="type" required maxLength={40} list="asset-types" defaultValue={v?.type} className={inputCls} />
        <datalist id="asset-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
      </Field>
      <Field id="as-date" text="Purchased"><input id="as-date" name="purchasedAt" type="date" defaultValue={v?.purchasedAt} className={inputCls} /></Field>
      <button className={btnCls} disabled={pending}>{pending ? "Adding..." : "Add asset"}</button>
    </form>
  );
}

export function ProfileForm({ name, department }: { name: string; department: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, initial);
  return (
    <form action={action} className="max-w-sm space-y-3">
      <Notice state={state} />
      <Field id="pf-name" text="Full name"><input id="pf-name" name="name" required maxLength={80} defaultValue={state.values?.name ?? name} className={inputCls} /></Field>
      <Field id="pf-dept" text="Department"><input id="pf-dept" name="department" maxLength={60} defaultValue={state.values?.department ?? department} className={inputCls} /></Field>
      <button className={btnCls} disabled={pending}>{pending ? "Saving..." : "Save profile"}</button>
    </form>
  );
}

export function RatingForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(rateTicketAction, initial);
  return (
    <form action={action} className="space-y-3">
      <Notice state={state} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">How well did we solve it?</legend>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex items-center gap-1 text-sm">
              <input type="radio" name="rating" value={n} required /> {n}
              <span className="sr-only"> out of 5</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">1 is poor, 5 is excellent.</p>
      </fieldset>
      <div>
        <label htmlFor="rating-comment" className="mb-1 block text-sm font-medium">Anything to add? (optional)</label>
        <textarea id="rating-comment" name="comment" rows={2} maxLength={500} defaultValue={state.values?.comment} className={inputCls} />
      </div>
      <button className={btnCls} disabled={pending}>{pending ? "Sending..." : "Send feedback"}</button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initial);
  return (
    <form action={action} className="max-w-sm space-y-3">
      <Notice state={state} />
      <Field id="pw-current" text="Current password">
        <input id="pw-current" name="current" type="password" required autoComplete="current-password" className={inputCls} />
      </Field>
      <Field id="pw-next" text="New password (at least 8 characters)">
        <input id="pw-next" name="next" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={inputCls} />
      </Field>
      <button className={btnCls} disabled={pending}>{pending ? "Saving..." : "Change password"}</button>
    </form>
  );
}
