import { createAssetRequest, decideRequest } from "@/app/actions";
import { readDb } from "@/lib/dataverse/store";
import { canApprove, canWorkTickets, requireUser } from "@/lib/session";
import { Badge, Card, PageTitle, btnCls, btnGhostCls, fmt, inputCls, label, requestTone } from "@/components/ui";

// Approval workflow: employees request equipment, managers approve or reject.
export default async function Requests() {
  const user = await requireUser();
  const db = await readDb();
  const requests = canWorkTickets(user) ? db.assetRequests : db.assetRequests.filter((r) => r.requesterId === user.id);
  const name = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? "-";
  const types = [...new Set(db.assets.map((a) => a.type))];

  return (
    <>
      <PageTitle sub="Requests need manager approval. Approving triggers the asset assignment flow.">Asset requests</PageTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="New request">
          <form action={createAssetRequest} className="space-y-3">
            <select name="assetType" className={inputCls} aria-label="Asset type">
              {types.map((t) => <option key={t}>{t}</option>)}
            </select>
            <textarea name="justification" required rows={3} placeholder="Why do you need it?" className={inputCls} />
            <button className={btnCls}>Submit request</button>
          </form>
        </Card>
        <div className="space-y-3 md:col-span-2">
          {requests.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm">
                  <p className="font-medium">{r.assetType} for {name(r.requesterId)}</p>
                  <p className="text-slate-600">{r.justification}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Requested {fmt(r.createdAt)}{r.decidedById && ` · decided by ${name(r.decidedById)}`}
                  </p>
                </div>
                <Badge tone={requestTone[r.status]}>{label(r.status)}</Badge>
              </div>
              {r.status === "pending" && canApprove(user) && (
                <form action={decideRequest} className="mt-3 flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button name="decision" value="approved" className={btnCls}>Approve</button>
                  <button name="decision" value="rejected" className={btnGhostCls}>Reject</button>
                </form>
              )}
            </Card>
          ))}
          {!requests.length && <p className="text-sm text-slate-400">No requests yet.</p>}
        </div>
      </div>
    </>
  );
}
