# Data model

Source of truth is `src/lib/dataverse/types.ts`. This doc explains the meaning and the rules. Update both together.

## Tables

| Table | Key fields | Notes |
|---|---|---|
| `users` | id, name, email, role (`employee`/`agent`/`manager`), department | Demo users u1..u5 are seeded; self-registered users get generated ids and are always employees. Role drives permissions. Email is unique. |
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
SQLite through `@libsql/client`. Local default: `data/helpdesk.db` (gitignored). Set `DATABASE_URL` to a hosted libSQL/Turso URL (with `DATABASE_AUTH_TOKEN`) to deploy. Tables are created on first use (`CREATE TABLE IF NOT EXISTS`, see `schema.ts`) and seeded from `seedDatabase()` the first time, which also gives the demo users a password (`DEMO_PASSWORD`).

SQL layout (snake_case columns): `users`, `categories`, `assets`, `tickets`, `comments`, `asset_requests`, `flow_runs`, plus `meta` (key/value, holds `nextTicketNumber` and the `seeded` flag). Foreign keys are enforced, and `users.email` and `tickets.number` are unique.

Load order matters: `readDb()` orders rows so arrays match what the code expects (tickets, requests and flow runs newest first; comments oldest first). Booleans are stored as 0/1, `flowRuns.actions` as JSON text.

## Authentication tables
Kept out of the `Database` object on purpose, so hashes and tokens never reach a page.

| Table | Fields | Notes |
|---|---|---|
| `auth_credentials` | user_id, password_hash | scrypt, format `scrypt$N$r$p$salt$hash` |
| `auth_sessions` | token_hash, user_id, expires_at | SHA-256 of the cookie token, 7-day expiry, expired rows purged on sign-in |

Deleting a user (only `resetDb` does) also deletes their credentials and sessions.

## Writes
`mutate(fn)` runs in one write transaction: load, run `fn`, write back only changed rows (upserts parent-first, deletes child-first). Calls in the same process are queued, and the transaction protects against other processes on the same file. Load-everything-per-request is fine for a demo; for large data, replace hot paths with targeted queries.
