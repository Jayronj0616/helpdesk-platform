import { notFound } from "next/navigation";
import { setUserActiveAction, setUserRoleAction } from "@/app/admin-actions";
import { CreateUserForm, ResetPasswordForm } from "@/components/ActionForms";
import { Badge, Card, PageTitle, btnGhostCls, inputCls, label } from "@/components/ui";
import { readDb } from "@/lib/dataverse/store";
import { isOpen } from "@/lib/dataverse/queries";
import { ROLES } from "@/lib/dataverse/types";
import { canApprove, requireUser } from "@/lib/session";

// User administration, managers only. Everyone else gets a 404, so the page's existence is not revealed.
export default async function AdminUsers() {
  const me = await requireUser();
  if (!canApprove(me)) notFound();
  const db = await readDb(["users", "tickets"]);
  const openFor = (id: string) => db.tickets.filter((t) => t.assigneeId === id && isOpen(t)).length;
  const openText = (id: string) => `${openFor(id)} open ticket${openFor(id) === 1 ? "" : "s"} assigned`;

  return (
    <>
      <PageTitle sub="Create accounts for IT staff, change roles, reset passwords, and deactivate accounts. Deactivated people cannot sign in, but their history stays.">Users</PageTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {db.users.map((u) => {
            const self = u.id === me.id;
            return (
              <Card key={u.id} className={u.active ? "" : "opacity-75"}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-medium">{u.name} {self && <Badge tone="purple">You</Badge>} {!u.active && <Badge tone="red">Deactivated</Badge>}</p>
                    <p className="text-slate-500">{u.email} · {u.department}</p>
                    {u.role !== "employee" && <p className="text-xs text-slate-500">{openText(u.id)}</p>}
                  </div>
                  <form action={setUserRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="role" defaultValue={u.role} disabled={self} aria-label={`Role for ${u.name}`} className={`${inputCls} w-auto`}>
                      {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                    </select>
                    <button className={btnGhostCls} disabled={self} title={self ? "You cannot change your own role" : undefined}>Save role</button>
                  </form>
                </div>
                {!self && (
                  <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                    <ResetPasswordForm userId={u.id} name={u.name} />
                    <form action={setUserActiveAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="active" value={u.active ? "0" : "1"} />
                      <button className={btnGhostCls} aria-label={`${u.active ? "Deactivate" : "Reactivate"} ${u.name}`}>{u.active ? "Deactivate" : "Reactivate"}</button>
                    </form>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        <Card title="Create a user">
          <CreateUserForm />
        </Card>
      </div>
    </>
  );
}
