# Data model

Source of truth is `src/lib/dataverse/types.ts`. This doc explains the meaning and the rules. Update both together.

## Tables

| Table | Key fields | Notes |
|---|---|---|
| `users` | id, name, email, role (`employee`/`agent`/`manager`), department | Seeded personas u1..u5. Role drives permissions. |
| `categories` | id, name | Reference data |
| `tickets` | id, number (autoincrement from `nextTicketNumber`), title, description, requesterId, assigneeId?, categoryId, priority, status, assetId?, createdAt, updatedAt, dueAt, resolvedAt?, escalated | `dueAt` is set by the "ticket created" flow from SLA hours |
| `comments` | id, ticketId, authorId? (null for system), body, kind (`comment`/`system`), internal, createdAt | `system` = audit trail written by actions and flows. `internal` = staff-only note. |
| `assets` | id, tag, name, type, status (`available`/`assigned`/`repair`/`retired`), assignedToId?, purchasedAt | |
| `assetRequests` | id, assetType, justification, requesterId, status (`pending`/`approved`/`rejected`), decidedById?, decidedAt?, createdAt | Decision triggers a flow |
| `flowRuns` | id, flow, trigger, actions[], at | Newest first, capped at 100 |

Relations: ticket -> user (requester, assignee), category, asset; comment -> ticket, user; assetRequest -> user; asset -> user.

## Enumerations
- Priority: `low` < `medium` < `high` < `critical`. SLA hours: critical 4, high 8, medium 24, low 72 (`SLA_HOURS`).
- Ticket status: `new`, `in_progress`, `waiting`, `resolved`, `closed`. "Open" means new, in_progress or waiting (`isOpen`).
- Overdue = open and `dueAt` in the past (`isOverdue`).

## Visibility rules (row-level security)
- **Employee**: sees only tickets where `requesterId` is them; opening another ticket returns 404. Sees all non-internal comments and system entries on their own tickets.
- **Agent / manager**: see all tickets and internal notes.
- Internal comments are filtered in `visibleComments()`. Never render comments without it.

## Storage
`data/db.json` (gitignored), created from `seedDatabase()` on first read. `readDb()` defaults tables added later (e.g. `comments`). All writes go through `mutate()`.
