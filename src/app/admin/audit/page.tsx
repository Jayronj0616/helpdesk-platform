import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageTitle, btnCls, btnGhostCls, fmt, inputCls } from "@/components/ui";
import { AUDIT_ACTIONS, auditLabel, readAudit } from "@/lib/audit";
import { canApprove, requireUser } from "@/lib/session";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

// Who did what, and when, for managers only (404 for everyone else). It is read-only: nothing in the app edits
// or deletes an entry.
export default async function AuditLog({ searchParams }: PageProps<"/admin/audit">) {
  const me = await requireUser();
  if (!canApprove(me)) notFound();

  const sp = await searchParams;
  const action = one(sp.action) && one(sp.action)! in AUDIT_ACTIONS ? one(sp.action)! : "";
  const log = await readAudit({ page: Number(one(sp.page)), action });
  const href = (page: number) => `/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), page: String(page) })}`;

  return (
    <>
      <PageTitle sub="Changes to accounts, categories, assets and automations, newest first. Entries cannot be edited or deleted.">Audit log</PageTitle>

      <form method="get" key={action} className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="audit-action" className="mb-1 block text-sm font-medium">Show</label>
          <select id="audit-action" name="action" defaultValue={action} className={`${inputCls} w-auto`}>
            <option value="">Everything</option>
            {Object.entries(AUDIT_ACTIONS).map(([code, text]) => <option key={code} value={code}>{text}</option>)}
          </select>
        </div>
        <button className={btnCls}>Filter</button>
        {action && <Link href="/admin/audit" className={`${btnGhostCls} inline-flex items-center`}>Clear</Link>}
      </form>

      <p className="mb-2 text-sm text-slate-500" aria-live="polite">
        {log.total} {log.total === 1 ? "entry" : "entries"}{action && ` for "${auditLabel(action)}"`}
      </p>

      <Card>
        {log.entries.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Audit log</caption>
              <thead className="text-slate-500">
                <tr>{["When", "Who", "What", "About", "Details"].map((h) => <th key={h} scope="col" className="py-1 pr-4 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {log.entries.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap py-2 pr-4">{fmt(e.at)}</td>
                    <td className="py-2 pr-4">{e.actorName}</td>
                    <td className="py-2 pr-4 font-medium">{auditLabel(e.action)}</td>
                    <td className="py-2 pr-4">{e.targetLabel ?? ""}</td>
                    <td className="py-2 pr-4 text-slate-600">{e.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {log.pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {log.page > 1 ? <Link href={href(log.page - 1)} className={btnGhostCls}>Newer</Link> : <span />}
          <span className="text-slate-500">Page {log.page} of {log.pages}</span>
          {log.page < log.pages ? <Link href={href(log.page + 1)} className={btnGhostCls}>Older</Link> : <span />}
        </nav>
      )}
    </>
  );
}
