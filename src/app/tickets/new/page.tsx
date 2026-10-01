import { createTicket } from "@/app/actions";
import { readDb } from "@/lib/dataverse/store";
import { SLA_HOURS } from "@/lib/dataverse/types";
import { Card, PageTitle, btnCls, inputCls, label } from "@/components/ui";

// Employee-facing "submit a ticket" form: the canvas app equivalent.
export default function NewTicket() {
  const { categories } = readDb();
  return (
    <>
      <PageTitle sub="Describe the problem. A flow assigns it and sets the SLA.">New ticket</PageTitle>
      <Card className="max-w-xl">
        <form action={createTicket} className="space-y-4">
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium">Title</label>
            <input id="title" name="title" required maxLength={120} className={inputCls} />
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium">Description</label>
            <textarea id="description" name="description" rows={4} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="categoryId" className="mb-1 block text-sm font-medium">Category</label>
              <select id="categoryId" name="categoryId" className={inputCls}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="priority" className="mb-1 block text-sm font-medium">Priority</label>
              <select id="priority" name="priority" defaultValue="medium" className={inputCls}>
                {(Object.keys(SLA_HOURS) as (keyof typeof SLA_HOURS)[]).map((p) => (
                  <option key={p} value={p}>{label(p)} ({SLA_HOURS[p]}h SLA)</option>
                ))}
              </select>
            </div>
          </div>
          <button className={btnCls}>Submit ticket</button>
        </form>
      </Card>
    </>
  );
}
