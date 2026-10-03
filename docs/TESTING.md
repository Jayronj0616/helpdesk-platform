# Testing

There is no automated test suite yet (it is in the backlog). Verification is static checks plus a manual script.

## Always before committing
```bash
npx eslint src && npx tsc --noEmit && npm run build
```

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

## Backlog for tests
Unit tests for `filterTickets`, `visibleComments`, and the three flows (they are pure functions over a `Database`, so they are easy to test with Vitest).
