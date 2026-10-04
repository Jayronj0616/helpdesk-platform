import Link from "next/link";
import { notFound } from "next/navigation";
import { ResetPasswordForm } from "@/components/ResetForms";
import { Card, PageTitle } from "@/components/ui";
import { isResetTokenValid } from "@/lib/auth/reset";
import { passwordResetAvailable } from "@/lib/mail";

export const metadata = { referrer: "no-referrer" }; // the token is in the URL, so never pass it on

export default async function ResetPassword({ params }: PageProps<"/reset-password/[token]">) {
  if (!passwordResetAvailable()) notFound();
  const { token } = await params;

  if (!(await isResetTokenValid(token))) {
    return (
      <div className="mx-auto max-w-md">
        <PageTitle>This link no longer works</PageTitle>
        <Card>
          <p className="text-sm">The reset link is invalid, has expired, or was already used. Reset links work once, for one hour.</p>
          <p className="mt-4 text-sm"><Link href="/forgot-password" className="font-medium text-indigo-700 hover:underline">Request a new link</Link></p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <PageTitle sub="Choose a new password. You will be signed out everywhere else.">Set a new password</PageTitle>
      <Card>
        <ResetPasswordForm token={token} />
      </Card>
    </div>
  );
}
