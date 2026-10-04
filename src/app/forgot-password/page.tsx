import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/ResetForms";
import { Card, PageTitle } from "@/components/ui";
import { passwordResetAvailable } from "@/lib/mail";
import { currentUser } from "@/lib/session";

export default async function ForgotPassword() {
  if (!passwordResetAvailable()) notFound();
  if (await currentUser()) redirect("/account");
  return (
    <div className="mx-auto max-w-md">
      <PageTitle sub="Enter your email and we will send you a link to choose a new password.">Forgot your password?</PageTitle>
      <Card>
        <ForgotPasswordForm />
        <p className="mt-4 text-sm text-slate-600">
          Remembered it? <Link href="/login" className="font-medium text-indigo-700 hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
