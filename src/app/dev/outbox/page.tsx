import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { devOutbox, mailMode } from "@/lib/mail";

// Development mail catcher: with no email provider configured, outgoing mail is stored in the database
// and shown here so the password reset flow can be used and tested. It is a 404 in production and
// whenever a real provider is set, because it would otherwise expose reset links to anyone.
export const dynamic = "force-dynamic";

export default async function DevOutbox() {
  if (mailMode() !== "dev") notFound();
  const mails = await devOutbox();
  return (
    <>
      <PageTitle sub="Development only. Emails the app would have sent.">Dev outbox</PageTitle>
      <div className="space-y-3">
        {mails.map((m) => (
          <Card key={`${m.at}-${m.to}`}>
            <p className="text-sm font-medium">{m.subject}</p>
            <p className="mb-2 text-xs text-slate-500">To {m.to} · {new Date(m.at).toLocaleString("en-PH")}</p>
            <pre className="whitespace-pre-wrap break-words text-sm">{m.body}</pre>
          </Card>
        ))}
        {!mails.length && <p className="text-sm text-slate-500">No emails yet.</p>}
      </div>
    </>
  );
}
