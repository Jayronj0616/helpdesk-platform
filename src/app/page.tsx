import { readDb } from "@/lib/dataverse/store";
import { isOpen, isOverdue } from "@/lib/dataverse/queries";
import { currentUser, canWorkTickets } from "@/lib/session";
import { Card, PageTitle, label } from "@/components/ui";

// Dashboard page: the Power BI report equivalent. Employees only see their own tickets
// (row-level security); agents and managers see everything.
export default async function Dashboard() {
  const [db, user] = [readDb(), await currentUser()];
  const tickets = canWorkTickets(user) ? db.tickets : db.tickets.filter((t) => t.requesterId === user.id);
  const open = tickets.filter(isOpen);
  const breached = tickets.filter(isOverdue);
  const resolved = tickets.filter((t) => t.resolvedAt);
  const avgHours = resolved.length
    ? resolved.reduce((s, t) => s + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()), 0) / resolved.length / 3_600_000
    : 0;

  const count = <T,>(items: T[], key: (i: T) => string) =>
    items.reduce<Record<string, number>>((m, i) => ((m[key(i)] = (m[key(i)] ?? 0) + 1), m), {});
  const byStatus = count(tickets, (t) => t.status);
  const byCategory = count(tickets, (t) => db.categories.find((c) => c.id === t.categoryId)?.name ?? "Other");
  const assetStatus = count(db.assets, (a) => a.status);

  const kpis = [
    { name: "Open tickets", value: open.length },
    { name: "SLA breached", value: breached.length, alert: breached.length > 0 },
    { name: "Avg. resolution", value: `${avgHours.toFixed(1)}h` },
    { name: "Pending requests", value: db.assetRequests.filter((r) => r.status === "pending").length },
  ];

  return (
    <>
      <PageTitle sub={`Viewing as ${user.name}${canWorkTickets(user) ? " (all tickets)" : " (your tickets only)"}`}>Dashboard</PageTitle>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.name}>
            <p className="text-sm text-slate-500">{k.name}</p>
            <p className={`mt-1 text-3xl font-semibold ${k.alert ? "text-red-600" : ""}`}>{k.value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Bars title="Tickets by status" data={byStatus} />
        <Bars title="Tickets by category" data={byCategory} />
        <Bars title="Assets by status" data={assetStatus} />
      </div>
    </>
  );
}

function Bars({ title, data }: { title: string; data: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <Card title={title}>
      <ul className="space-y-2">
        {Object.entries(data).map(([k, v]) => (
          <li key={k} className="text-sm">
            <div className="mb-1 flex justify-between"><span>{label(k)}</span><span className="text-slate-500">{v}</span></div>
            <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-indigo-500" style={{ width: `${(v / max) * 100}%` }} /></div>
          </li>
        ))}
        {!Object.keys(data).length && <li className="text-sm text-slate-400">No data</li>}
      </ul>
    </Card>
  );
}
