import { notFound } from "next/navigation";
import { updateTicket } from "@/app/actions";
import { readDb } from "@/lib/dataverse/store";
import { canWorkTickets, currentUser } from "@/lib/session";
import { Badge, Card, PageTitle, btnCls, fmt, inputCls, label, priorityTone, statusTone } from "@/components/ui";

// Ticket form: the model-driven app "main form". Only agents and managers can edit.
export default async function TicketDetail({ params }: PageProps<"/tickets/[id]">) {
  const { id } = await params;
  const [db, user] = [readDb(), await currentUser()];
  const t = db.tickets.find((x) => x.id === id);
  // Row-level security: employees can only open their own tickets.
  if (!t || (!canWorkTickets(user) && t.requesterId !== user.id)) notFound();

  const name = (uid: string | null) => db.users.find((u) => u.id === uid)?.name ?? "Unassigned";
  const asset = db.assets.find((a) => a.id === t.assetId);
  const agents = db.users.filter((u) => u.role !== "employee");
  const editable = canWorkTickets(user);

  const rows: [string, React.ReactNode][] = [
    ["Requester", name(t.requesterId)],
    ["Category", db.categories.find((c) => c.id === t.categoryId)?.name],
    ["Priority", <Badge key="p" tone={priorityTone[t.priority]}>{label(t.priority)}</Badge>],
    ["Created", fmt(t.createdAt)],
    ["SLA due", fmt(t.dueAt)],
    ["Related asset", asset ? `${asset.tag} (${asset.name})` : "None"],
  ];

  return (
    <>
      <PageTitle sub={`Ticket #${t.number}`}>{t.title}</PageTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Details" className="md:col-span-2">
          <p className="mb-4 whitespace-pre-wrap text-sm">{t.description || "No description."}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {rows.map(([k, v]) => (
              <div key={k}><dt className="text-slate-500">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </Card>
        <Card title="Status">
          {editable ? (
            <form action={updateTicket} className="space-y-3">
              <input type="hidden" name="id" value={t.id} />
              <select name="status" defaultValue={t.status} className={inputCls} aria-label="Status">
                {["new", "in_progress", "waiting", "resolved", "closed"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
              <select name="assigneeId" defaultValue={t.assigneeId ?? ""} className={inputCls} aria-label="Assignee">
                <option value="">Unassigned</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className={btnCls}>Save</button>
            </form>
          ) : (
            <div className="space-y-2 text-sm">
              <Badge tone={statusTone[t.status]}>{label(t.status)}</Badge>
              <p>Assigned to {name(t.assigneeId)}</p>
              <p className="text-slate-400">Only IT staff can edit tickets.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
