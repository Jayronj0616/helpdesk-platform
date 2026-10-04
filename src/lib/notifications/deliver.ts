import { getDb } from "../dataverse/db";
import { ensureSeeded } from "../dataverse/store";
import { appUrl, mailMode, sendMail } from "../mail";
import { MAX_ATTEMPTS } from "./queue";

// The delivery half of the outbox: sends what ./queue stored. It is deliberately separate from the change that
// queued the mail, so a slow or failing mail provider can never make a ticket update fail, and it can be retried.
//
// Guarantees: a message is attempted at most MAX_ATTEMPTS times, two workers never send the same attempt twice
// (each attempt is claimed with a conditional UPDATE first), and a failure is kept with its reason so a manager
// can see it. It is at-least-once: if the process dies after the provider accepted a message but before it was
// marked sent, the next run sends it again.

/**
 * Addresses that can never receive real mail (RFC 2606 reserved names). The demo accounts use them, so a public
 * demo with a real provider configured cannot send anything to a stranger's domain by accident.
 */
const RESERVED = /(\.test|\.example|\.invalid|\.localhost)$|@example\.(com|org|net)$/i;
export const isReservedAddress = (email: string) => RESERVED.test(email.trim());

export interface DeliveryResult {
  sent: number;
  skipped: number;
  failed: number;
}

export async function deliverPending(limit = 20): Promise<DeliveryResult> {
  await ensureSeeded();
  const client = await getDb();
  const result: DeliveryResult = { sent: 0, skipped: 0, failed: 0 };

  const due = await client.execute({
    sql: `SELECT id, to_address, subject, body, ticket_id, attempts FROM notifications
          WHERE status IN ('pending', 'failed') AND attempts < ? ORDER BY created_at LIMIT ?`,
    args: [MAX_ATTEMPTS, limit],
  });

  for (const row of due.rows) {
    const id = String(row.id);
    // Claim this attempt. If another worker got there first, the attempts counter has moved and we skip it.
    const claim = await client.execute({
      sql: "UPDATE notifications SET attempts = attempts + 1 WHERE id = ? AND attempts = ? AND status IN ('pending', 'failed')",
      args: [id, Number(row.attempts)],
    });
    if (claim.rowsAffected !== 1) continue;

    const to = String(row.to_address);
    const finish = (status: "sent" | "skipped" | "failed", error: string | null) =>
      client.execute({
        sql: "UPDATE notifications SET status = ?, sent_at = ?, last_error = ? WHERE id = ?",
        args: [status, status === "sent" ? new Date().toISOString() : null, error, id],
      });

    const mode = mailMode();
    if (mode === "off") {
      await finish("skipped", "Email is not configured");
      result.skipped++;
    } else if (mode === "provider" && isReservedAddress(to)) {
      await finish("skipped", "Reserved address, never delivered");
      result.skipped++;
    } else {
      try {
        const base = row.ticket_id ? appUrl() : null;
        const link = base ? `\n\nOpen the ticket: ${base}/tickets/${row.ticket_id}` : "";
        await sendMail({ to, subject: String(row.subject), text: String(row.body) + link });
        await finish("sent", null);
        result.sent++;
      } catch (err) {
        await finish("failed", (err instanceof Error ? err.message : "Unknown error").slice(0, 300));
        result.failed++;
      }
    }
  }
  return result;
}

/** Gives messages that ran out of attempts another set of tries, then delivers. For the manager's button. */
export async function retryFailedAndDeliver(limit = 50): Promise<DeliveryResult & { requeued: number }> {
  await ensureSeeded();
  const client = await getDb();
  const reset = await client.execute({ sql: "UPDATE notifications SET status = 'pending', attempts = 0 WHERE status = 'failed'", args: [] });
  return { requeued: reset.rowsAffected, ...(await deliverPending(limit)) };
}
