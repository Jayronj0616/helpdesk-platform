import { notFound } from "next/navigation";
import { addTicketComment, updateTicket } from "@/app/actions";
import { RatingForm } from "@/components/ActionForms";
import { canRate } from "@/lib/dataverse/feedback";
import { readComments, readDb } from "@/lib/dataverse/store";
import { filterVisible } from "@/lib/dataverse/comments";
import { canWorkTickets, requireUser } from "@/lib/session";
import { Badge, Card, PageTitle, btnCls, fmt, inputCls, label, priorityTone, statusTone } from "@/components/ui";

// Ticket form: the model-driven app "main form". Only agents and managers can edit.
export default async function TicketDetail({ params }: PageProps<"/tickets/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const db = await readDb(["users", "categories", "tickets", "assets"]);
  const t = db.tickets.find((x) => x.id === id);
  // Row-level security: employees can only open their own tickets.
  if (!t || (!canWorkTickets(user) && t.requesterId !== user.id)) notFound();

  const name = (uid: string | null) => db.users.find((u) => u.id === uid)?.name ?? "Unassigned";
  const asset = db.assets.find((a) => a.id === t.assetId);
  // Active staff, plus the current assignee even if they have since been deactivated, so the form still shows them.
  const agents = db.users.filter((u) => u.role !== "employee" && (u.active || u.id === t.assigneeId));
  const editable = canWorkTickets(user);
  const thread = filterVisible(await readComments(t.id), editable);

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
              <select name="assetId" defaultValue={t.assetId ?? ""} className={inputCls} aria-label="Related asset">
                <option value="">No related asset</option>
                {db.assets.filter((a) => a.status !== "retired" || a.id === t.assetId).map((a) => (
                  <option key={a.id} value={a.id}>{a.tag} - {a.name}</option>
                ))}
              </select>
              <button className={btnCls}>Save</button>
            </form>
          ) : (
            <div className="space-y-2 text-sm">
              <Badge tone={statusTone[t.status]}>{label(t.status)}</Badge>
              <p>Assigned to {name(t.assigneeId)}</p>
              <p className="text-slate-500">Only IT staff can edit tickets.</p>
            </div>
          )}
        </Card>
      </div>

      {(t.rating !== null || canRate(t, user.id) || (editable && (t.status === "resolved" || t.status === "closed"))) && (
        <Card title="Customer satisfaction" className="mt-4">
          {t.rating !== null ? (
            <div className="text-sm">
              <p aria-label={`Rated ${t.rating} out of 5`}>
                <span aria-hidden="true" className="text-lg tracking-wide text-amber-500">{"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}</span>
                <span className="ml-2 text-slate-600">{t.rating} out of 5</span>
              </p>
              {t.ratingComment && <p className="mt-2 whitespace-pre-wrap">{t.ratingComment}</p>}
              {t.ratedAt && <p className="mt-1 text-xs text-slate-500">Rated by {name(t.requesterId)} on {fmt(t.ratedAt)}</p>}
              {/* Saving swaps the form for this view, so this is the requester's confirmation. */}
              {t.requesterId === user.id && <p className="mt-2 text-xs text-slate-500">Thanks for letting us know.</p>}
            </div>
          ) : canRate(t, user.id) ? (
            <RatingForm ticketId={t.id} />
          ) : (
            <p className="text-sm text-slate-600">Not rated yet.</p>
          )}
        </Card>
      )}

      <Card title={`Activity (${thread.length})`} className="mt-4">
        <ol className="mb-4 space-y-3">
          {thread.map((c) =>
            c.kind === "system" ? (
              <li key={c.id} className="text-xs text-slate-500">
                {fmt(c.createdAt)} · {c.body}
              </li>
            ) : (
              <li key={c.id} className={`rounded border p-3 text-sm ${c.internal ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}>
                <p className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{name(c.authorId)}</span>
                  <span>{fmt(c.createdAt)}</span>
                  {c.internal && <Badge tone="amber">Internal note</Badge>}
                </p>
                <p className="whitespace-pre-wrap">{c.body}</p>
              </li>
            ),
          )}
          {!thread.length && <li className="text-sm text-slate-500">No activity yet.</li>}
        </ol>
        <form action={addTicketComment} className="space-y-2">
          <input type="hidden" name="ticketId" value={t.id} />
          <textarea name="body" required rows={3} maxLength={2000} aria-label="Add a comment" placeholder="Write a comment..." className={inputCls} />
          <div className="flex items-center gap-4">
            <button className={btnCls}>Add comment</button>
            {editable && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="internal" /> Internal note (hidden from requester)
              </label>
            )}
          </div>
        </form>
      </Card>
    </>
  );
}
