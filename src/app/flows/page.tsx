import { resetDemoData, runEscalation } from "@/app/actions";
import { readDb } from "@/lib/dataverse/store";
import { DEMO_MODE } from "@/lib/config";
import { canApprove, requireUser } from "@/lib/session";
import { Card, PageTitle, btnCls, btnGhostCls, fmt } from "@/components/ui";

// Run history: the Power Automate "28-day run history" equivalent.
export default async function Flows() {
  const user = await requireUser();
  const db = await readDb();
  const manager = canApprove(user);
  return (
    <>
      <PageTitle sub="Every automation run is logged here with the actions it took.">Flow runs</PageTitle>
      <div className="mb-6 flex flex-wrap gap-3">
        <form action={runEscalation}>
          <button className={btnCls} disabled={!manager}>Run &quot;Escalate overdue tickets&quot;</button>
        </form>
        {DEMO_MODE && (
          <form action={resetDemoData}>
            <button className={btnGhostCls} disabled={!manager}>Reset demo data</button>
          </form>
        )}
        {!manager && <p className="self-center text-sm text-slate-500">Only managers can run flows. Sign in as dina@contoso.test to try it.</p>}
      </div>
      <div className="space-y-3">
        {db.flowRuns.map((r) => (
          <Card key={r.id}>
            <div className="flex justify-between text-sm">
              <p className="font-medium">{r.flow}</p>
              <p className="text-slate-400">{fmt(r.at)}</p>
            </div>
            <p className="mb-2 text-xs text-slate-500">Trigger: {r.trigger}</p>
            <ul className="list-inside list-disc text-sm text-slate-700">
              {r.actions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </Card>
        ))}
        {!db.flowRuns.length && <p className="text-sm text-slate-400">No runs yet. Create a ticket or run a flow.</p>}
      </div>
    </>
  );
}
