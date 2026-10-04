import { ChangePasswordForm, ProfileForm } from "@/components/ActionForms";
import { Card, PageTitle, label } from "@/components/ui";
import { requireUser } from "@/lib/session";

export default async function Account() {
  const user = await requireUser();
  return (
    <>
      <PageTitle sub="Your profile and password.">Account</PageTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Profile">
          <dl className="mb-4 space-y-2 text-sm">
            <div><dt className="text-slate-500">Email (your sign-in, not editable)</dt><dd>{user.email}</dd></div>
            <div><dt className="text-slate-500">Role (set by a manager)</dt><dd>{label(user.role)}</dd></div>
          </dl>
          <ProfileForm name={user.name} department={user.department} />
        </Card>
        <Card title="Change password">
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
