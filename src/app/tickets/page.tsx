import Link from "next/link";
import { readDb } from "@/lib/dataverse/store";
import { isOverdue } from "@/lib/dataverse/queries";
import { canWorkTickets, currentUser } from "@/lib/session";
import { Badge, PageTitle, btnCls, fmt, label, priorityTone, statusTone } from "@/components/ui";
import type { TicketStatus } from "@/lib/dataverse/types";

// Ticket list: the model-driven app "view". Filter with ?status=...
export default async function Tickets({ searchParams }: PageProps<"/tickets">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? (sp.status as TicketStatus) : undefined;
  const created = typeof sp.created === "string" ? sp.created : undefined;
  const [db, user] = [readDb(), await currentUser()];

  let tickets = canWorkTickets(user) ? db.tickets : db.tickets.filter((t) => t.requesterId === user.id);
  if (status) tickets = tickets.filter((t) => t.status === status);
  const name = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? "Unassigned";
  const statuses: TicketStatus[] = ["new", "in_progress", "waiting", "resolved", "closed"];

  return (
    <>
      <div className="flex items-start justify-between">
        <PageTitle sub="Click a ticket to view or update it.">Tickets</PageTitle>
        <Link href="/tickets/new" className={btnCls}>New ticket</Link>
      </div>
      {created && (
        <p className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Ticket #{created} created. The &quot;When a ticket is created&quot; flow ran, see Flow runs.
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/tickets" className={`rounded-full border px-3 py-1 ${!status ? "bg-indigo-600 text-white" : "bg-white"}`}>All</Link>
        {statuses.map((s) => (
          <Link key={s} href={`/tickets?status=${s}`} className={`rounded-full border px-3 py-1 ${status === s ? "bg-indigo-600 text-white" : "bg-white"}`}>
            {label(s)}
          </Link>
        ))}
      </div>
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
                  <td className={`px-4 py-2 ${late ? "font-medium text-red-600" : ""}`}>{fmt(t.dueAt)}{late && " (late)"}</td>
                </tr>
              );
            })}
            {!tickets.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No tickets</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
