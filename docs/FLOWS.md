# Automation flows

Code: `src/lib/flows/index.ts`. Each flow takes the `db` object, so it runs inside the caller's single `mutate()`, writes a `flowRuns` entry through `logRun`, and may write ticket audit entries through `addSystemEntry`.

| Flow | Trigger | Called from | Steps |
|---|---|---|---|
| `onTicketCreated` | A ticket is created | `createTicket` | 1. Set `dueAt` from priority SLA. 2. Assign the agent with the fewest open tickets and set status to `in_progress`. 3. "Email" the agent. 4. If critical, "Teams alert" the manager. 5. Write audit entries ("Ticket created", "auto-assigned"). |
| `escalateOverdue` | Manager clicks the button on `/flows` (hourly schedule in the real version) | `runEscalation` | For each open, non-escalated, overdue ticket (tickets in Waiting are never overdue, their SLA clock is paused): raise priority one level (capped at critical), set `escalated`, "email" the manager, write an audit entry. Logs "No overdue tickets found" if none. |
| `onAssetRequestDecided` | Manager approves or rejects a request | `decideRequest` | Approved: assign the first available asset of that type to the requester, or log a purchase task if none. Rejected: "email" the requester. |
| `closeStaleResolved` | Manager clicks "Close resolved tickets" on `/flows`, or the daily cron job | `runCloseResolved`, `/api/cron/maintenance` | Closes every ticket that has been **Resolved for longer than 7 days** (the reopen window, one shared constant, so exactly the tickets that can no longer be reopened), writes an audit entry, "emails" the requester. Logs "No resolved tickets are older than 7 days" if none. |
| `onTicketReopened` | The requester reopens a resolved ticket | `reopenTicketAction` (via `reopenTicket`) | Logs the restarted SLA clock (the rule has already reset status, assignee and due date). Emails the assignee, or when nobody active holds it, notes that it is back in the new queue and emails the manager. |

## Scheduled runs
`/api/cron/maintenance` runs `runMaintenance`: escalate overdue tickets, then close old resolved ones. It exists only when `CRON_SECRET` is set (404 otherwise), and needs `Authorization: Bearer <CRON_SECRET>`, compared in constant time. `vercel.json` schedules it daily at 06:00 UTC, which is the most a free Vercel plan allows; run it more often (for example hourly) on a paid plan or from any scheduler that can send the header. Runs started this way are labelled "Scheduled run" in the history, and manual ones "Manual run".

Emails and Teams messages are simulated: they are only recorded as text in the run's `actions`. No real messages are sent.

## Adding a flow
1. Write the function in `flows/index.ts`; start with the `actions` array and finish with `logRun`.
2. Call it from a server action inside `mutate()`.
3. Add it to this table and to section 3 of POWER-PLATFORM-BLUEPRINT.md.
