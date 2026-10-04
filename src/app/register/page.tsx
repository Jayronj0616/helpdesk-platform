import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/AuthForms";
import { Card, PageTitle } from "@/components/ui";
import { currentUser } from "@/lib/session";

export default async function Register() {
  if (await currentUser()) redirect("/");
  return (
    <div className="mx-auto max-w-md">
      <PageTitle sub="New accounts are employee accounts. IT staff accounts are created by an administrator.">Create an account</PageTitle>
      <Card>
        <RegisterForm />
        <p className="mt-4 text-sm text-slate-600">
          Already registered? <Link href="/login" className="font-medium text-indigo-700 hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
