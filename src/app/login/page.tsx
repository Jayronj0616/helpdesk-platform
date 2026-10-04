import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { Card, PageTitle } from "@/components/ui";
import { DEMO_MODE, DEMO_PASSWORD } from "@/lib/config";
import { seedDatabase } from "@/lib/dataverse/seed";
import { passwordResetAvailable } from "@/lib/mail";
import { currentUser } from "@/lib/session";

export default async function Login({ searchParams }: PageProps<"/login">) {
  if (await currentUser()) redirect("/");
  const justReset = (await searchParams).reset === "1";
  const demoUsers = DEMO_MODE ? seedDatabase().users : [];

  return (
    <div className="mx-auto max-w-md">
      <PageTitle sub="Sign in to the helpdesk.">Sign in</PageTitle>
      <Card>
        {justReset && (
          <p role="status" className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Password changed. Sign in with your new password.
          </p>
        )}
        <LoginForm />
        <p className="mt-4 text-sm text-slate-600">
          No account? <Link href="/register" className="font-medium text-indigo-700 hover:underline">Create one</Link>
        </p>
        {passwordResetAvailable() && (
          <p className="mt-2 text-sm text-slate-600">
            <Link href="/forgot-password" className="font-medium text-indigo-700 hover:underline">Forgot your password?</Link>
          </p>
        )}
      </Card>

      {demoUsers.length > 0 && (
        <Card title="Demo accounts" className="mt-4">
          <p className="mb-2 text-sm text-slate-600">
            This is a portfolio demo. Sign in as any of these (password <code className="rounded bg-slate-100 px-1">{DEMO_PASSWORD}</code>) to try each role:
          </p>
          <ul className="space-y-1 text-sm">
            {demoUsers.map((u) => (
              <li key={u.id} className="flex justify-between gap-2">
                <span className="font-mono text-xs">{u.email}</span>
                <span className="text-slate-500">{u.role}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
