import Link from "next/link";
import { readDb } from "@/lib/dataverse/store";
import { SORTS, filterTickets, hasFilters, isOverdue, paginate, parseTicketFilters } from "@/lib/dataverse/queries";
import { canWorkTickets, requireUser } from "@/lib/session";
import { Badge, PageTitle, btnCls, btnGhostCls, fmt, inputCls, label, priorityTone, statusTone } from "@/components/ui";
import { PRIORITIES, TICKET_STATUSES } from "@/lib/dataverse/types";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

// Ticket list: the model-driven app "view". All filters live in the URL (GET form), so views are shareable.
export default async function Tickets({ searchParams }: PageProps<"/tickets">) {
  const sp = await searchParams;
  const created = one(sp.created);
  const user = await requireUser();
  const db = await readDb(["users", "categories", "tickets"]);
  const staff = canWorkTickets(user);

  const filters = parseTicketFilters(sp, db);
  const visible = staff ? db.tickets : db.tickets.filter((t) => t.requesterId === user.id);
  const matches = filterTickets(db, visible, filters);
  const paged = paginate(matches, Number(one(sp.page)));
  const tickets = paged.items;
  // Page links keep the current filters but drop the one-time "created" banner.
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page" && k !== "created") params.set(k, v);
    params.set("page", String(p));
    return `/tickets?${params}`;
  };
  const filtered = hasFilters(filters);
  // The export uses the same filters as this page, but covers every match rather than one page.
  const exportParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page" && k !== "created") exportParams.set(k, v);
  const exportHref = `/tickets/export${exportParams.size ? `?${exportParams}` : ""}`;
  const name = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? "Unassigned";

  return (
    <>
      <div className="flex items-start justify-between">
        <PageTitle sub="Click a ticket to view or update it.">Tickets</PageTitle>
        <div className="flex gap-2">
          {staff && <a href={exportHref} className={`${btnGhostCls} inline-flex items-center`}>Export CSV</a>}
          <Link href="/tickets/new" className={btnCls}>New ticket</Link>
        </div>
      </div>
      {created && (
        <p className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Ticket #{created} created. The &quot;When a ticket is created&quot; flow ran, see Flow runs.
        </p>
      )}

      <form method="get" className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <input
          name="q" type="search" defaultValue={filters.q} aria-label="Search tickets"
          placeholder="Search number, title, description, requester"
          className={`${inputCls} sm:col-span-2`}
        />
        <select name="status" defaultValue={filters.status ?? ""} aria-label="Status" className={inputCls}>
          <option value="">Any status</option>
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select name="priority" defaultValue={filters.priority ?? ""} aria-label="Priority" className={inputCls}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
        </select>
        <select name="category" defaultValue={filters.categoryId ?? ""} aria-label="Category" className={inputCls}>
          <option value="">Any category</option>
          {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {staff && (
          <select name="assignee" defaultValue={filters.assignee ?? ""} aria-label="Assignee" className={inputCls}>
            <option value="">Any assignee</option>
            <option value="none">Unassigned</option>
            {db.users.filter((u) => u.role !== "employee").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <select name="sort" defaultValue={filters.sort ?? "newest"} aria-label="Sort by" className={inputCls}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} /> Overdue only
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
          <button className={btnCls}>Apply</button>
          {filtered && <Link href="/tickets" className={`${btnGhostCls} inline-flex items-center`}>Clear</Link>}
        </div>
      </form>

      <p className="mb-2 text-sm text-slate-500" aria-live="polite">
        {paged.total} of {visible.length} tickets{filtered && " match your filters"}
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {["#", "Title", "Requester", "Assignee", "Priority", "Status", "Due"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => {
              const late = isOverdue(t);
              return (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-500">{t.number}</td>
                  <td className="px-4 py-2"><Link href={`/tickets/${t.id}`} className="font-medium text-indigo-700 hover:underline">{t.title}</Link></td>
                  <td className="px-4 py-2">{name(t.requesterId)}</td>
                  <td className="px-4 py-2">{name(t.assigneeId)}</td>
                  <td className="px-4 py-2"><Badge tone={priorityTone[t.priority]}>{label(t.priority)}</Badge>{t.escalated && <span className="ml-1 text-xs text-red-600">escalated</span>}</td>
                  <td className="px-4 py-2"><Badge tone={statusTone[t.status]}>{label(t.status)}</Badge></td>
                  <td className={`px-4 py-2 ${late ? "font-medium text-red-600" : ""}`}>{t.status === "waiting" ? <span title="The SLA clock is paused while we wait for the customer">Paused</span> : <>{fmt(t.dueAt)}{late && " (late)"}</>}</td>
                </tr>
              );
            })}
            {!tickets.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No tickets found</td></tr>}
          </tbody>
        </table>
      </div>
      {paged.pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {paged.page > 1 ? <Link href={pageHref(paged.page - 1)} className={btnGhostCls}>Previous</Link> : <span />}
          <span className="text-slate-500">Page {paged.page} of {paged.pages}</span>
          {paged.page < paged.pages ? <Link href={pageHref(paged.page + 1)} className={btnGhostCls}>Next</Link> : <span />}
        </nav>
      )}
    </>
  );
}
