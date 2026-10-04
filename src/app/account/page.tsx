import { ChangePasswordForm } from "@/components/ActionForms";
import { Card, PageTitle, label } from "@/components/ui";
import { requireUser } from "@/lib/session";

export default async function Account() {
  const user = await requireUser();
  return (
    <>
      <PageTitle sub="Your profile and password.">Account</PageTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Profile">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-slate-500">Name</dt><dd>{user.name}</dd></div>
            <div><dt className="text-slate-500">Email</dt><dd>{user.email}</dd></div>
            <div><dt className="text-slate-500">Department</dt><dd>{user.department}</dd></div>
            <div><dt className="text-slate-500">Role</dt><dd>{label(user.role)}</dd></div>
          </dl>
        </Card>
        <Card title="Change password">
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
