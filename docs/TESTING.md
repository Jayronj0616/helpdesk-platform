# Testing

Verification is automated unit tests (Vitest) plus static checks plus a manual script for the UI.

## Always before committing
```bash
npx eslint . && npx tsc --noEmit && npm test && npm run build
```

## Unit tests (`tests/`, run with `npm test`)
The data layer and flows are pure functions over a `Database`, so tests build a fresh `seedDatabase()` and call them directly. No server or file access is needed.

| File | Covers |
|---|---|
| `tests/queries.test.ts` | `isOverdue`, `filterTickets` (every filter, search, sorting, no input mutation), `paginate` (clamping, empty list) |
| `tests/comments.test.ts` | `visibleComments` (internal notes hidden from employees, ordering), `addComment`, `addSystemEntry` |
| `tests/flows.test.ts` | `onTicketCreated` (SLA, least-busy assignment, critical alert, no agents), `escalateOverdue` (idempotent, capped, ignores closed), `onAssetRequestDecided` (approve, out of stock, reject) |

Tests depend on the relative dates in `src/lib/dataverse/seed.ts`. If you change the seed, re-run the tests and adjust expectations (for example ticket 1001 is the only overdue open ticket).

Add a test whenever you add or change a function in `queries.ts`, `comments.ts` or `flows/index.ts`. Server actions and pages are covered by the manual script below.

## Quick checks with curl
Start the server (`npm run dev -- -p 3100`) and delete `data/db.json` first to reseed. The default persona is Maria (employee). Pass `-b persona=u3` for Ana (agent) or `-b persona=u5` for Dina (manager).

| Check | Command | Expect |
|---|---|---|
| Employee isolation | `curl -s -o /dev/null -w "%{http_code}" localhost:3100/tickets/t2` | `404` (t2 belongs to Carlo) |
| Internal note hidden | `curl -s localhost:3100/tickets/t1 \| grep -c "Loaner laptop"` | `0` as Maria, `1` with `-b persona=u3` |
| Staff list | `curl -s -b persona=u3 "localhost:3100/tickets" \| sed 's/<!-- -->//g' \| grep -o "[0-9]* of [0-9]* tickets"` | `6 of 6 tickets` |
| Search | same, `?q=vpn` | `1 of 6` |
| Filters | `?priority=high&overdue=1`, `?assignee=none`, `?status=waiting` | `1 of 6` each |
| Bad filter ignored | `?status=zzz` | `6 of 6` |

React inserts `<!-- -->` between adjacent text values, so strip them before grepping rendered text.

## Manual browser script
1. As Maria: submit a ticket, then open `/flows` and see the "When a ticket is created" run. Open the ticket and see its activity entries.
2. As Maria: add a comment on ticket 1001. As Ana: add an internal note and confirm Maria cannot see it.
3. As Ana: change status and assignee, and confirm audit entries appear.
4. As Maria: submit an asset request. As Dina: approve it on `/requests`, then check `/assets` for the assignment and `/flows` for the run.
5. As Dina: click "Run Escalate overdue tickets", then confirm ticket 1001 is escalated.
6. As Dina: "Reset demo data" restores the seed.

## Last manual verification
Steps 1 to 6 above were run in a real browser on 2026-10-03: ticket creation and its flow, comments, manager approval (asset assigned, run logged), escalation (priority raised, audit entry written) and reset. Pagination was checked with 31 tickets (clamping, filters kept in page links).

## Not covered yet
Server actions and pages have no automated tests. A Playwright suite for the manual script is the natural next step.
