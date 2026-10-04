"use client";

import { useActionState } from "react";
import { addCategoryAction, renameCategoryAction } from "@/app/admin-actions";
import { btnCls, btnGhostCls, inputCls } from "@/components/ui";
import type { FormState } from "@/lib/form-state";

const initial: FormState = {};

function Notice({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.message) return <p role="status" className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{state.message}</p>;
  return null;
}

export function AddCategoryForm() {
  const [state, action, pending] = useActionState(addCategoryAction, initial);
  return (
    <form action={action} className="space-y-3">
      <Notice state={state} />
      <div>
        <label htmlFor="cat-new" className="mb-1 block text-sm font-medium">Category name</label>
        <input id="cat-new" name="name" required maxLength={40} defaultValue={state.values?.name} className={inputCls} />
      </div>
      <button className={btnCls} disabled={pending}>{pending ? "Adding..." : "Add category"}</button>
    </form>
  );
}

export function RenameCategoryForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(renameCategoryAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="name" required maxLength={40} defaultValue={state.values?.name ?? name} aria-label={`Name of category ${name}`} className={`${inputCls} max-w-xs`} />
      <button className={btnGhostCls} disabled={pending}>{pending ? "Saving..." : "Rename"}</button>
      <div className="w-full"><Notice state={state} /></div>
    </form>
  );
}
