# Data model

Source of truth is `src/lib/dataverse/types.ts`. This doc explains the meaning and the rules. Update both together.

## Tables

| Table | Key fields | Notes |
|---|---|---|
| `users` | id, name, email, role (`employee`/`agent`/`manager`), department, active | Demo users u1..u5 are seeded; self-registered users get generated ids and are always employees. Role drives permissions. Email is unique. `active=false` accounts cannot sign in (same answer as a wrong password), lose their sessions at once, and are never offered as assignees; their name stays on past tickets and comments. |
| `categories` | id, name | Reference data |
| `tickets` | id, number (autoincrement from `nextTicketNumber`), title, description, requesterId, assigneeId?, categoryId, priority, status, assetId?, createdAt, updatedAt, dueAt, resolvedAt?, escalated, rating? (1 to 5, database CHECK), ratingComment?, ratedAt?, waitingSince? (set while Waiting, the SLA clock is paused from then) | `dueAt` is set by the "ticket created" flow from SLA hours |
| `comments` | id, ticketId, authorId? (null for system), body, kind (`comment`/`system`), internal, createdAt | `system` = audit trail written by actions and flows. `internal` = staff-only note. |
| `assets` | id, tag, name, type, status (`available`/`assigned`/`repair`/`retired`), assignedToId?, purchasedAt | |
| `assetRequests` | id, assetType, justification, requesterId, status (`pending`/`approved`/`rejected`), decidedById?, decidedAt?, createdAt | Decision triggers a flow |
| `notifications` | id, toAddress, subject, body, ticketId?, createdAt, status (`pending`/`sent`/`failed`/`skipped`, database CHECK), attempts, sentAt?, lastError? | The email outbox: flows add `pending` rows inside their own transaction, `deliverPending()` sends them. Kept 7 days, at most 200 rows (pruned on every queue). |
| `flowRuns` | id, flow, trigger, actions[], at | Newest first, capped at 100 |

Relations: ticket -> user (requester, assignee), category, asset; comment -> ticket, user; assetRequest -> user; asset -> user.

## Enumerations
- Priority: `low` < `medium` < `high` < `critical`. SLA hours: critical 4, high 8, medium 24, low 72 (`SLA_HOURS`).
- Ticket status: `new`, `in_progress`, `waiting`, `resolved`, `closed`. "Open" means new, in_progress or waiting (`isOpen`).
- Overdue = open, not Waiting, and `dueAt` in the past (`isOverdue`). Waiting pauses the SLA clock.

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

Deleting a user (only `resetDb` does) also deletes their credentials and sessions. Everyone else is deactivated, never deleted.

| `auth_reset_tokens` | token_hash, user_id, expires_at | SHA-256 of the emailed reset token, 60-minute expiry, deleted when used, replaced by a newer request, or cancelled by any password change |
| `dev_outbox` | id, at, to_addr, subject, body | Only written in development when no email provider is set (see `lib/mail.ts`); shown on `/dev/outbox` |
| `auth_attempts` | key_hash, at | Sign-in, register and password-change attempts for rate limiting. The key is a SHA-256 of IP and email, never the plain values. Rows older than the window are deleted on each attempt. |

## Schema versions
`meta.schema_version` records the schema version. Version 1 is the schema before migrations existed, and a database that has users but no version is treated as version 1. `migrations.ts` lists the changes: v2 added `users.active`; v4 added `tickets.waiting_since` (existing Waiting tickets are paused from their last update); v3 added the ticket rating columns (`rating` with a `CHECK (rating BETWEEN 1 AND 5)`, `rating_comment`, `rated_at`). On connect, a database with no `users` table is created from `schema.ts` and stamped with the latest version; an older one has the pending migrations applied, each in one batch together with its version bump, so a crash cannot leave it half migrated, and two instances starting together are safe.

## Reads
`readDb()` loads everything. `readDb(["users", "tickets"])` loads only those tables in one round trip, and its return type contains only them, so a page cannot quietly use a table it did not request. `readComments(ticketId)` is a single indexed query for one ticket's comments (including internal notes: the caller must pass them through `filterVisible`). `mutate()` always loads everything, because it needs the full picture to work out what changed. Indexes (`INDEX_SQL` in `schema.ts`) cover comments by ticket, tickets by requester, assignee and status, and requests by requester; they are created on every connect with `IF NOT EXISTS`, so existing databases get them without a migration.

## Writes
`mutate(fn)` runs in one write transaction: load, run `fn`, write back only changed rows (upserts parent-first, deletes child-first). Calls in the same process are queued, and the transaction protects against other processes on the same file. A write still loads every table (to diff it), which is fine into the low thousands of rows; past that, give hot write paths targeted statements.
