import { updateAssetAction } from "@/app/actions";
import { AddAssetForm } from "@/components/ActionForms";
import { Badge, Card, PageTitle, assetTone, btnGhostCls, inputCls, label } from "@/components/ui";
import { requestTypes } from "@/lib/dataverse/admin";
import { readDb } from "@/lib/dataverse/store";
import { ASSET_STATUSES } from "@/lib/dataverse/types";
import { canWorkTickets, requireUser } from "@/lib/session";

// Asset register: a Dataverse table view. IT staff can add assets and change status and holder.
export default async function Assets() {
  const user = await requireUser();
  const db = await readDb(["users", "assets"]);
  const staff = canWorkTickets(user);
  const name = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? "-";
  const headers = ["Tag", "Name", "Type", "Status", "Assigned to", "Purchased", ...(staff ? ["Manage"] : [])];

  return (
    <>
      <PageTitle sub="Hardware inventory. Assets are also assigned automatically when a request is approved.">Assets</PageTitle>
      {staff && (
        <Card title="Add an asset" className="mb-4">
          <AddAssetForm types={requestTypes(db)} />
        </Card>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{headers.map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {db.assets.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-xs">{a.tag}</td>
                <td className="px-4 py-2">{a.name}</td>
                <td className="px-4 py-2">{a.type}</td>
                <td className="px-4 py-2"><Badge tone={assetTone[a.status]}>{label(a.status)}</Badge></td>
                <td className="px-4 py-2">{name(a.assignedToId)}</td>
                <td className="px-4 py-2">{a.purchasedAt}</td>
                {staff && (
                  <td className="px-4 py-2">
                    <form action={updateAssetAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <select name="status" defaultValue={a.status} aria-label={`Status of ${a.tag}`} className={`${inputCls} w-auto`}>
                        {ASSET_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                      </select>
                      <select name="assignedToId" defaultValue={a.assignedToId ?? ""} aria-label={`Holder of ${a.tag}`} className={`${inputCls} w-auto`}>
                        <option value="">Nobody</option>
                        {db.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <button className={btnGhostCls}>Save</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {!db.assets.length && <tr><td colSpan={headers.length} className="px-4 py-6 text-center text-slate-500">No assets yet</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
