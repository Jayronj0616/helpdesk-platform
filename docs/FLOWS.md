# Automation flows

Code: `src/lib/flows/index.ts`. Each flow takes the `db` object, so it runs inside the caller's single `mutate()`, writes a `flowRuns` entry through `logRun`, and may write ticket audit entries through `addSystemEntry`.

| Flow | Trigger | Called from | Steps |
|---|---|---|---|
| `onTicketCreated` | A ticket is created | `createTicket` | 1. Set `dueAt` from priority SLA. 2. Assign the agent with the fewest open tickets and set status to `in_progress`. 3. "Email" the agent. 4. If critical, "Teams alert" the manager. 5. Write audit entries ("Ticket created", "auto-assigned"). |
| `escalateOverdue` | Manager clicks the button on `/flows` (hourly schedule in the real version) | `runEscalation` | For each open, non-escalated, overdue ticket (tickets in Waiting are never overdue, their SLA clock is paused): raise priority one level (capped at critical), set `escalated`, "email" the manager, write an audit entry. Logs "No overdue tickets found" if none. |
| `onAssetRequestDecided` | Manager approves or rejects a request | `decideRequest` | Approved: assign the first available asset of that type to the requester, or log a purchase task if none. Rejected: "email" the requester. |
| `closeStaleResolved` | Manager clicks "Close resolved tickets" on `/flows`, or the daily cron job | `runCloseResolved`, `/api/cron/maintenance` | Closes every ticket that has been **Resolved for longer than 7 days** (the reopen window, one shared constant, so exactly the tickets that can no longer be reopened), writes an audit entry, "emails" the requester. Logs "No resolved tickets are older than 7 days" if none. |
| `onTicketReopened` | The requester reopens a resolved ticket | `reopenTicketAction` (via `reopenTicket`) | Queues an email and logs the restarted SLA clock (the rule has already reset status, assignee and due date). Emails the assignee, or when nobody active holds it, notes that it is back in the new queue and emails the manager. |

## Scheduled runs
`/api/cron/maintenance` runs `runMaintenance`: escalate overdue tickets, then close old resolved ones. It exists only when `CRON_SECRET` is set (404 otherwise), and needs `Authorization: Bearer <CRON_SECRET>`, compared in constant time. `vercel.json` schedules it daily at 06:00 UTC, which is the most a free Vercel plan allows; run it more often (for example hourly) on a paid plan or from any scheduler that can send the header. Runs started this way are labelled "Scheduled run" in the history, and manual ones "Manual run".

## Emails (a transactional outbox)
Flows really send email now, in two steps so a mail problem can never break a ticket update:
1. **Queue** (inside the flow, in the same database transaction as the change): `queueMail(db, { to, subject, body, ticketId })` in `lib/notifications/queue.ts` adds a `pending` row to `notifications` and returns the run-log line `Queued email to X: subject`. If the change rolls back, the email never existed.
2. **Deliver** (just after the response, in `after()`; and from the cron job, which also retries): `deliverPending()` in `lib/notifications/deliver.ts` sends each pending email through `sendMail` (Resend, or the dev outbox in development) and records `sent`, `failed` (with the reason, retried up to 5 times) or `skipped`.

What gets emailed: the assigned agent (new ticket), the manager (SLA breach), the requester (asset request decided, ticket closed), the assignee or manager (ticket reopened). Not emailed: the critical-ticket **Teams** alert, which stays a simulated log line because Teams is not connected.

Rules worth knowing:
- `skipped` means it was never going to be delivered: email is not configured (production, no provider), or the address is reserved (`.test`, `.example`, `.invalid`, `.localhost`, `example.com/org/net`). The demo accounts use `@contoso.test`, so a public demo with a real provider cannot email strangers.
- Delivery is **at-least-once**: each attempt is claimed with a conditional UPDATE so two workers never send the same attempt, but a crash after the provider accepts a message and before it is marked sent means the next run sends it again.
- Finished emails are kept for 7 days and the outbox never exceeds 200 rows (the outbox is rewritten on every save, so it must stay small); pending and retrying ones are always kept.
- Managers see the queue and can press "Send queued emails now" on `/flows` (it also gives exhausted failures another five tries).

Emails queued by a flow never include secrets, and bodies are plain text.

## Adding a flow
1. Write the function in `flows/index.ts`; start with the `actions` array and finish with `logRun`.
2. Call it from a server action inside `mutate()`.
3. Add it to this table and to section 3 of POWER-PLATFORM-BLUEPRINT.md.
