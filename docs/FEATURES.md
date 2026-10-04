# Features and permissions

Every route, what it does, and who can do what. Role checks live in `src/app/actions.ts` (writes) and in the page (reads).

| Route | What it does | Employee | Agent | Manager |
|---|---|---|---|---|
| `/login`, `/register` | Sign in and self-registration (public) | yes | yes | yes |
| `/` | Dashboard: KPI tiles, bar charts, tickets created per day (7 days). Ticket and request figures are scoped to the user; asset counts are global. | own tickets and requests only | all | all |
| `/tickets` | List with search (number, title, description, requester), filters (status, priority, category, assignee, overdue) and sort. State is in the URL query: `q`, `status`, `priority`, `category`, `assignee` (user id or `none`), `overdue=1`, `sort` (`newest`/`oldest`/`due`/`priority`). Invalid values are ignored. Paginated 10 per page with `page` (out-of-range pages are clamped; filters are kept in the page links). | own | all | all |
| `/tickets/new` | Submit ticket, which runs the "ticket created" flow. Optional related asset: employees can only pick assets assigned to them, staff any non-retired asset (re-checked in `createTicket`). The category is validated against the table. | yes | yes | yes |
| `/tickets/[id]` | Details, activity thread, comment form | own only (404 otherwise) | all | all |
| `/tickets/[id]` status, assignee and related-asset form | `updateTicket`, which writes audit entries for each changed field. Unknown asset ids are ignored, and the assignee must be an agent or manager. | no | yes | yes |
| Comment form | `addTicketComment`; max 2000 chars | own tickets, never internal | any ticket, can mark internal | same as agent |
| `/assets` | Asset register (read-only) | yes | yes | yes |
| `/requests` | Submit an asset request; list | own | all (read) | all, approve or reject |
| `/flows` | Flow run history | read | read | read, run escalation, reset demo data (demo mode only) |

## Server actions (`src/app/actions.ts`)
`createTicket`, `updateTicket`, `addTicketComment`, `createAssetRequest`, `decideRequest`, `runEscalation`, `resetDemoData`. Each re-checks the role itself, never trusting the UI.

## Authentication
Email and password. `/login` signs in, `/register` creates an **employee** account (self-service never creates agents or managers; those exist only in the seed or are inserted by an administrator in the database). A session is a random token in an HttpOnly, SameSite=Lax cookie (`Secure` in production); only its SHA-256 is stored, with a 7-day expiry. Every page and server action calls `requireUser()`, which redirects signed-out visitors to `/login`.

- Passwords: minimum 8 characters, hashed with scrypt.
- Login and register are rate limited (5 attempts per 15 minutes per IP and email, in memory).
- Wrong email and wrong password give the same message, and unknown emails still cost a hash, so accounts cannot be enumerated by response or timing.
- **Demo mode** (default on, `DEMO_MODE=0` turns it off): the login page lists the demo accounts and their shared password, and managers get a "Reset demo data" button on `/flows`. Turn it off, and change `DEMO_PASSWORD`, for anything that is not a public demo.
