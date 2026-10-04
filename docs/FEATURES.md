# Features and permissions

Every route, what it does, and who can do what. Role checks live in `src/app/actions.ts` (writes) and in the page (reads).

| Route | What it does | Employee | Agent | Manager |
|---|---|---|---|---|
| `/login`, `/register` | Sign in and self-registration (public) | yes | yes | yes |
| `/` | Dashboard: KPI tiles, bar charts, tickets created per day (7 days), and average customer satisfaction ("No ratings yet" until one exists). Ticket and request figures are scoped to the user; asset counts are global. | own tickets and requests only | all | all |
| `/tickets` | List with search (number, title, description, requester), filters (status, priority, category, assignee, overdue) and sort. State is in the URL query: `q`, `status`, `priority`, `category`, `assignee` (user id or `none`), `overdue=1`, `sort` (`newest`/`oldest`/`due`/`priority`). Invalid values are ignored. Paginated 10 per page with `page` (out-of-range pages are clamped; filters are kept in the page links). | own | all | all |
| `/tickets/export` | CSV download of every ticket matching the list's current filters (not just one page): number, title, description, requester, assignee, category, priority, status, ISO dates, escalated, asset tag, rating and rating comment. Staff only: 401 signed out, 403 for employees. Cells that start with `=`, `+`, `-`, `@`, tab or CR get a leading apostrophe so a ticket titled `=HYPERLINK(...)` cannot run as a spreadsheet formula. UTF-8 with a byte order mark, CRLF lines. | no | yes | yes |
| `/tickets/new` | Submit ticket, which runs the "ticket created" flow. Optional related asset: employees can only pick assets assigned to them, staff any non-retired asset (re-checked in `createTicket`). The category is validated against the table. | yes | yes | yes |
| `/tickets/[id]` | Details, reopen (requester), customer satisfaction, activity thread, comment form | own only (404 otherwise) | all | all |
| `/tickets/[id]` status, assignee and related-asset form | `updateTicket`, which writes audit entries for each changed field and keeps the SLA clock honest: **Waiting** (on the customer) pauses it, and leaving Waiting for New or In progress moves the due date back by the time spent waiting (resolving or closing just ends the pause). While Waiting a ticket shows "Paused" instead of a due date and can never be overdue or escalated. Unknown asset ids are ignored, and the assignee must be an agent or manager. | no | yes | yes |
| Reopen | The requester reopens a **resolved** ticket (not closed) within 7 days of resolution, with a required reason (`reopenTicketAction`). It returns to the previous assignee if they are still active staff, otherwise to the new queue; the SLA clock restarts, `escalated` is cleared, the reason becomes a public comment, an audit entry is written and the "reopened" flow runs. A rating, if given, stays. Same answer for missing and not-yours tickets. | own resolved tickets | no | no |
| Satisfaction rating | The requester rates a resolved or closed ticket 1 to 5 with an optional comment (`rateTicketAction`). Once only, so the average cannot be gamed; only the requester can (a stranger gets the same answer for a missing ticket and someone else's), and staff see the rating but cannot give one. Writes an audit entry. | own resolved or closed tickets | view only | view only |
| Comment form | `addTicketComment`; max 2000 chars | own tickets, never internal | any ticket, can mark internal | same as agent |
| `/assets` | Asset register. Staff can add an asset (`createAssetAction`: unique uppercase tag, type spelling reused) and change status and holder (`updateAssetAction`: only `assigned` assets have a holder). | read only | add and edit | add and edit |
| `/forgot-password`, `/reset-password/[token]` | Password reset by emailed link (see Authentication). 404 when email is not configured in production. | yes | yes | yes |
| `/dev/outbox` | Development mail catcher: emails the app would have sent. 404 in production and whenever a provider is configured. | dev only | dev only | dev only |
| `/api/cron/maintenance` | Runs the time-based flows (escalate overdue, close old resolved). 404 unless `CRON_SECRET` is set, 401 without `Authorization: Bearer <CRON_SECRET>`; called daily by Vercel Cron | machine | machine | machine |
| `/api/health` | Public JSON `{status}`: 200 when the database is reachable, migrated and seeded, otherwise a bare 503 (no details) | yes | yes | yes |
| `/account` | Edit your own name and department (`updateProfileAction`; email is your sign-in and role is set by a manager, so neither is editable here) and change your password (needs the current password; signs out other devices) | yes | yes | yes |
| `/admin/categories` | Add, rename and delete ticket categories. Renaming keeps every ticket's link (tickets point at the id). A category with tickets cannot be deleted, and at least one must remain. Names are unique ignoring case. 404 for non-managers. | no | no | yes |
| `/admin/users` | List users, create a user with any role, change a role, reset a password, deactivate or reactivate an account. 404 for non-managers. | no | no | yes |
| `/requests` | Submit an asset request; list | own | all (read) | all, approve or reject |
| `/flows` | Flow run history | read | read | read, run escalation, run close-resolved-tickets, reset demo data (demo mode only) |

## Server actions (`src/app/actions.ts`)
`createTicket`, `updateTicket`, `addTicketComment`, `createAssetRequest`, `decideRequest`, `runEscalation`, `resetDemoData`, `createAssetAction`, `updateAssetAction`, `updateProfileAction`, `rateTicketAction`, `reopenTicketAction`, `runEscalation`, `runCloseResolved`. Each re-checks the role itself, never trusting the UI.

## Admin actions (`src/app/admin-actions.ts`, managers only)
`createUserAction`, `setUserRoleAction`, `setUserActiveAction`, `resetUserPasswordAction`, `addCategoryAction`, `renameCategoryAction`, `deleteCategoryAction`. Rules:
- A manager cannot change their own role (so the last manager cannot lock everyone out) and cannot reset their own password here (use Account).
- Demoting an agent or manager to employee unassigns their open tickets, with an audit entry on each ticket. Resolved and closed tickets keep their history.
- Resetting a password signs that user out everywhere.
- **Deactivating** an account (never deleting) removes their sessions at once, unassigns their open tickets with an audit entry, and stops them signing in or being offered as an assignee or flow target. Managers cannot deactivate themselves. Reactivating restores sign-in with the same password.
- The role check uses the role stored in the database, not anything sent by the browser, and takes effect immediately.

## Security headers
Every response sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation, payment off), `Strict-Transport-Security`, and a partial `Content-Security-Policy` (`frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`), and drops `X-Powered-By`. A script-restricting CSP needs per-request nonces with Next.js and is not set.

## Authentication
Email and password. `/login` signs in, `/register` creates an **employee** account (self-service never creates agents or managers; those exist only in the seed or are inserted by an administrator in the database). A session is a random token in an HttpOnly, SameSite=Lax cookie (`Secure` in production); only its SHA-256 is stored, with a 7-day expiry. Every page and server action calls `requireUser()`, which redirects signed-out visitors to `/login`.

- Passwords: minimum 8 characters, hashed with scrypt.
- **Password reset by email:** `/forgot-password` always answers "If an account exists for that email, we have sent a link" and does the work after the response (`after()`), so neither the message nor the timing reveals who has an account. Deactivated accounts get no email. The link holds a random token (stored only as a hash), works once, and expires after 60 minutes; asking again replaces the earlier link, and any other password change cancels it. Using it signs the user out everywhere. Limits: 5 requests per IP and 5 per address per 15 minutes (the address limit trips silently). The link is built from `APP_URL`, never from the request Host header in production. The feature only exists when it can actually deliver: a provider (`RESEND_API_KEY` and `MAIL_FROM`) plus `APP_URL` in production, or development mode, where mail goes to `/dev/outbox`.
- Login, register and password change are rate limited: 5 attempts per 15 minutes per IP and email (per user for password change). The counters live in the database, so the limit holds across serverless instances, and only hashed keys are stored.
- Wrong email and wrong password give the same message, and unknown emails still cost a hash, so accounts cannot be enumerated by response or timing.
- **Demo mode** (default on, `DEMO_MODE=0` turns it off): the first run seeds demo users and sample data, the login page lists the demo accounts and their shared password, and managers get a "Reset demo data" button on `/flows`. Reset restores the seed data **and the demo accounts' passwords and active status**, so a visitor who changes a demo password cannot lock others out. With `DEMO_MODE=0` the first run creates only the categories and one manager from `ADMIN_EMAIL` and `ADMIN_PASSWORD` (see DEPLOY.md). Turn demo mode off, and change `DEMO_PASSWORD`, for anything that is not a public demo.
- Request types offered on `/requests` are the defaults (Laptop, Monitor, Phone, Keyboard and mouse, Headset) plus any type in the asset register, so an empty register still works.
