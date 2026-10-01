import type { ReactNode } from "react";

const TONES = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-blue-100 text-blue-800",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  purple: "bg-purple-100 text-purple-800",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export const priorityTone = { low: "gray", medium: "blue", high: "amber", critical: "red" } as const;
export const statusTone = { new: "purple", in_progress: "blue", waiting: "amber", resolved: "green", closed: "gray" } as const;
export const assetTone = { available: "green", assigned: "blue", repair: "amber", retired: "gray" } as const;
export const requestTone = { pending: "amber", approved: "green", rejected: "red" } as const;

export const label = (s: string) => s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>}
      {children}
    </section>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold">{children}</h1>
      {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

export const inputCls = "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm";
export const btnCls = "rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700";
export const btnGhostCls = "rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50";

export const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
