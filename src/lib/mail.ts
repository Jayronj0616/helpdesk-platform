import { getDb } from "./dataverse/db";
import { newId } from "./dataverse/store";

// Outgoing email. Settings are read when called (not at import) so tests can change them.
//
//  provider  RESEND_API_KEY and MAIL_FROM are set: send through Resend's HTTP API (no SDK needed).
//  dev       no provider and not production: store the message in the database instead, and show it
//            on /dev/outbox. This makes the password reset flow usable and testable with no setup.
//  off       no provider in production: nothing is sent, and features that need email turn themselves off.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type MailMode = "provider" | "dev" | "off";

export function mailMode(): MailMode {
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) return "provider";
  return process.env.NODE_ENV === "production" ? "off" : "dev";
}

/**
 * Public address of the app, used to build links in emails. In production it must be set
 * (APP_URL=https://your-app.example), because a link built from the request's Host header can be
 * poisoned by an attacker who sends a forged Host and gets the victim to click it.
 */
export function appUrl(requestHost?: string | null, requestProto?: string | null): string | null {
  const fixed = process.env.APP_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  if (process.env.NODE_ENV === "production") return null;
  return requestHost ? `${requestProto ?? "http"}://${requestHost}` : "http://localhost:3000";
}

/** Password reset needs a way to deliver the link and a trustworthy address to put in it. */
export function passwordResetAvailable(): boolean {
  const mode = mailMode();
  if (mode === "off") return false;
  return mode === "dev" || appUrl() !== null;
}

export async function sendMail(mail: Mail): Promise<void> {
  const mode = mailMode();

  if (mode === "provider") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) throw new Error(`Email provider rejected the message (HTTP ${res.status})`);
    return;
  }

  if (mode === "dev") {
    const client = await getDb();
    await client.execute({
      sql: "INSERT INTO dev_outbox (id, at, to_addr, subject, body) VALUES (?, ?, ?, ?, ?)",
      args: [newId("mail"), Date.now(), mail.to, mail.subject, mail.text],
    });
    return;
  }

  throw new Error("Email is not configured (set RESEND_API_KEY and MAIL_FROM).");
}

export async function devOutbox(limit = 20) {
  const client = await getDb();
  const res = await client.execute({ sql: "SELECT at, to_addr, subject, body FROM dev_outbox ORDER BY at DESC LIMIT ?", args: [limit] });
  return res.rows.map((r) => ({ at: Number(r.at), to: String(r.to_addr), subject: String(r.subject), body: String(r.body) }));
}
