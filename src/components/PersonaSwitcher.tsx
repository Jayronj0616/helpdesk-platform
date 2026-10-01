"use client";

import { useRef } from "react";
import type { User } from "@/lib/dataverse/types";
import { switchPersona } from "@/app/actions";

export function PersonaSwitcher({ current, users }: { current: User; users: User[] }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={switchPersona} className="flex items-center gap-2 text-sm">
      <label htmlFor="persona" className="text-slate-500">Signed in as</label>
      <select
        id="persona"
        name="userId"
        defaultValue={current.id}
        onChange={() => form.current?.requestSubmit()}
        className="rounded border border-slate-300 bg-white px-2 py-1"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
        ))}
      </select>
    </form>
  );
}
