import { readDb } from "@/lib/dataverse/store";
import { requireUser } from "@/lib/session";
import { Badge, PageTitle, assetTone, label } from "@/components/ui";

// Asset register: a Dataverse table view.
export default async function Assets() {
  await requireUser();
  const db = await readDb();
  const name = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? "-";
  return (
    <>
      <PageTitle sub="Hardware inventory. Assets are assigned automatically when a request is approved.">Assets</PageTitle>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Tag", "Name", "Type", "Status", "Assigned to", "Purchased"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
