import { resetDemoData, runCloseResolved, runEscalation, sendQueuedEmails } from "@/app/actions";
import { readDb } from "@/lib/dataverse/store";
import { DEMO_MODE } from "@/lib/config";
import { canApprove, requireUser } from "@/lib/session";
import { Card, PageTitle, btnCls, btnGhostCls, fmt } from "@/components/ui";

// Run history: the Power Automate "28-day run history" equivalent.
export default async function Flows() {
  const user = await requireUser();
  const db = await readDb(["flowRuns"]);
  const manager = canApprove(user);
  // The email queue shows addresses and subjects, so only managers get it.
  const queue = manager ? (await readDb(["notifications"])).notifications : [];
  const count = (status: string) => queue.filter((n) => n.status === status).length;
  return (
    <>
      <PageTitle sub="Every automation run is logged here with the actions it took.">Flow runs</PageTitle>
      <div className="mb-6 flex flex-wrap gap-3">
        <form action={runEscalation}>
          <button className={btnCls} disabled={!manager}>Run &quot;Escalate overdue tickets&quot;</button>
        </form>
        <form action={runCloseResolved}>
          <button className={btnCls} disabled={!manager}>Run &quot;Close resolved tickets&quot;</button>
        </form>
        <form action={sendQueuedEmails}>
          <button className={btnGhostCls} disabled={!manager}>Send queued emails now</button>
        </form>
        {DEMO_MODE && (
          <form action={resetDemoData}>
            <button className={btnGhostCls} disabled={!manager}>Reset demo data</button>
          </form>
        )}
        {!manager && <p className="self-center text-sm text-slate-500">Only managers can run flows. Sign in as dina@contoso.test to try it.</p>}
      </div>
      {manager && (
        <Card title="Email queue" className="mb-6">
          <p className="mb-3 text-sm text-slate-600">
            {count("pending")} waiting, {count("sent")} sent, {count("failed")} failed, {count("skipped")} skipped. Flows queue an email in the same
            step as the change that caused it, and it is sent right after. Failures are retried up to 5 times.
          </p>
          {queue.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>{["To", "Subject", "Status", "Tries", "Note"].map((h) => <th key={h} className="py-1 pr-4 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {queue.slice(0, 10).map((n) => (
                    <tr key={n.id} className="border-t border-slate-100">
                      <td className="py-1 pr-4 font-mono text-xs">{n.toAddress}</td>
                      <td className="py-1 pr-4">{n.subject}</td>
                      <td className="py-1 pr-4">{n.status}</td>
                      <td className="py-1 pr-4">{n.attempts}</td>
                      <td className="py-1 pr-4 text-slate-600">{n.lastError ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No emails yet.</p>
          )}
        </Card>
      )}
      <div className="space-y-3">
        {db.flowRuns.map((r) => (
          <Card key={r.id}>
            <div className="flex justify-between text-sm">
              <p className="font-medium">{r.flow}</p>
              <p className="text-slate-500">{fmt(r.at)}</p>
            </div>
            <p className="mb-2 text-xs text-slate-500">Trigger: {r.trigger}</p>
            <ul className="list-inside list-disc text-sm text-slate-700">
              {r.actions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </Card>
        ))}
        {!db.flowRuns.length && <p className="text-sm text-slate-500">No runs yet. Create a ticket or run a flow.</p>}
      </div>
    </>
  );
}
