import { notFound } from "next/navigation";
import { deleteCategoryAction } from "@/app/admin-actions";
import { AddCategoryForm, RenameCategoryForm } from "@/components/CategoryForms";
import { Card, PageTitle, btnGhostCls } from "@/components/ui";
import { readDb } from "@/lib/dataverse/store";
import { canApprove, requireUser } from "@/lib/session";

// Ticket categories, managers only (404 for everyone else).
export default async function AdminCategories() {
  const me = await requireUser();
  if (!canApprove(me)) notFound();
  const db = await readDb();
  const used = (id: string) => db.tickets.filter((t) => t.categoryId === id).length;

  return (
    <>
      <PageTitle sub="The categories people choose when they raise a ticket. Renaming updates every ticket. A category with tickets cannot be deleted.">Categories</PageTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {db.categories.map((c) => {
            const n = used(c.id);
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <RenameCategoryForm id={c.id} name={c.name} />
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <span>{n} ticket{n === 1 ? "" : "s"}</span>
                    <form action={deleteCategoryAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        className={btnGhostCls}
                        disabled={n > 0 || db.categories.length <= 1}
                        aria-label={`Delete category ${c.name}`}
                        title={n > 0 ? "In use by tickets, rename it instead" : undefined}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <Card title="Add a category">
          <AddCategoryForm />
        </Card>
      </div>
    </>
  );
}
