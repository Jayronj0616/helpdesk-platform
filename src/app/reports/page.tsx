import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageTitle, btnCls, inputCls } from "@/components/ui";
import { PERIODS, buildReport, formatDuration, formatPercent, parsePeriod, type Row } from "@/lib/dataverse/reports";
import { readDb } from "@/lib/dataverse/store";
import { canWorkTickets, requireUser } from "@/lib/session";

// Reports for IT staff: the Power BI report equivalent. Employees get a 404.
export default async function Reports({ searchParams }: PageProps<"/reports">) {
  const user = await requireUser();
  if (!canWorkTickets(user)) notFound();

  const { key, days } = parsePeriod((await searchParams).days);
  const db = await readDb(["tickets", "users", "categories", "comments"]);
  const report = buildReport(db, days);
  const { summary: s } = report;
  const periodLabel = PERIODS.find(([k]) => k === key)![1].toLowerCase();
  const peak = Math.max(1, ...report.trend.flatMap((d) => [d.created, d.resolved]));

  const tiles = [
    { name: "Tickets", value: String(s.total), note: `${s.open} still open` },
    { name: "Resolved", value: String(s.resolved), note: s.breachedOpen ? `${s.breachedOpen} open past their due date` : "none overdue" },
    { name: "SLA met", value: formatPercent(s.slaCompliance), note: "of resolved tickets" },
    { name: "Avg. resolution", value: formatDuration(s.avgResolutionHours), note: "created to resolved" },
    { name: "Median first reply", value: formatDuration(s.medianFirstResponseHours), note: "to the first public comment" },
    { name: "Satisfaction", value: s.avgRating === null ? "-" : `${s.avgRating.toFixed(1)} / 5`, note: s.ratingCount ? `${s.ratingCount} rating${s.ratingCount === 1 ? "" : "s"}` : "no ratings yet" },
  ];

  return (
    <>
      <PageTitle sub={`Tickets created in the ${periodLabel}. The daily chart always shows the last 14 days.`}>Reports</PageTitle>

      <form method="get" key={key} className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="period" className="mb-1 block text-sm font-medium">Period</label>
          <select id="period" name="days" defaultValue={key} className={`${inputCls} w-auto`}>
            {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <button className={btnCls}>Show</button>
        <Link href="/tickets" className="text-sm text-indigo-700 hover:underline">Go to tickets</Link>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <Card key={t.name}>
            <p className="text-sm text-slate-500">{t.name}</p>
            <p className="mt-1 text-2xl font-semibold">{t.value}</p>
            <p className="text-xs text-slate-500">{t.note}</p>
          </Card>
        ))}
      </div>

      <Card title="Created and resolved, last 14 days" className="mb-6">
        <div className="mb-2 flex gap-4 text-xs text-slate-600">
          <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-3 rounded-sm bg-indigo-500" />Created</span>
          <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-3 rounded-sm bg-emerald-500" />Resolved</span>
        </div>
        <div className="flex h-36 items-end gap-1" aria-hidden="true">
          {report.trend.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end text-xs text-slate-500">
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <div className="w-1/2 rounded-t bg-indigo-500" style={{ height: `${(d.created / peak) * 85}%`, minHeight: d.created ? 3 : 0 }} title={`${d.created} created`} />
                <div className="w-1/2 rounded-t bg-emerald-500" style={{ height: `${(d.resolved / peak) * 85}%`, minHeight: d.resolved ? 3 : 0 }} title={`${d.resolved} resolved`} />
              </div>
              <span className="mt-1">{new Date(d.day).toLocaleDateString("en-PH", { day: "numeric", timeZone: "UTC" })}</span>
            </div>
          ))}
        </div>
        {/* The same numbers as a table, for people who cannot see the chart. */}
        <table className="sr-only">
          <caption>Tickets created and resolved per day</caption>
          <thead><tr><th>Day</th><th>Created</th><th>Resolved</th></tr></thead>
          <tbody>{report.trend.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.created}</td><td>{d.resolved}</td></tr>)}</tbody>
        </table>
      </Card>

      <div className="space-y-6">
        <Breakdown title="By person" firstColumn="Assignee" rows={report.agents} />
        <Breakdown title="By category" firstColumn="Category" rows={report.categories} />
        <Breakdown title="By priority" firstColumn="Priority" rows={report.priorities} />
      </div>

      <details className="mt-6 text-sm text-slate-600">
        <summary className="cursor-pointer text-indigo-700">How these figures are worked out</summary>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li><strong>Resolved</strong>: Resolved or Closed with a resolved time. A reopened ticket stops counting until it is resolved again.</li>
          <li><strong>SLA met</strong>: resolved at or before its due date. The due date already includes time spent Waiting on the customer, so that wait is never held against the team.</li>
          <li><strong>Resolution time</strong>: created to resolved. <strong>First reply</strong>: created to the first public comment from IT staff (internal notes and the customer&apos;s own comments do not count).</li>
          <li><strong>Overdue</strong> counts open tickets past their due date right now; Waiting tickets are paused, so they are never overdue.</li>
          <li>A dash means there is nothing to measure yet, not zero.</li>
        </ul>
      </details>
    </>
  );
}

function Breakdown({ title, firstColumn, rows }: { title: string; firstColumn: string; rows: Row[] }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No tickets in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="text-slate-500">
              <tr>
                {[firstColumn, "Tickets", "Open", "Resolved", "SLA met", "Avg. resolution", "Satisfaction"].map((h) => (
                  <th key={h} scope="col" className="py-1 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100">
                  <th scope="row" className="py-1 pr-4 font-medium">{r.label}</th>
                  <td className="py-1 pr-4">{r.total}</td>
                  <td className="py-1 pr-4">{r.open}</td>
                  <td className="py-1 pr-4">{r.resolved}</td>
                  <td className="py-1 pr-4">{formatPercent(r.slaCompliance)}</td>
                  <td className="py-1 pr-4">{formatDuration(r.avgResolutionHours)}</td>
                  <td className="py-1 pr-4">{r.avgRating === null ? "-" : `${r.avgRating.toFixed(1)} (${r.ratingCount})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
