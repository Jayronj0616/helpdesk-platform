# Features and permissions

Every route, what it does, and who can do what. Role checks live in `src/app/actions.ts` (writes) and in the page (reads).

| Route | What it does | Employee | Agent | Manager |
|---|---|---|---|---|
| `/` | Dashboard: KPI tiles, bar charts | own tickets only | all | all |
| `/tickets` | List with search (number, title, description, requester), filters (status, priority, category, assignee, overdue) and sort. State is in the URL query: `q`, `status`, `priority`, `category`, `assignee` (user id or `none`), `overdue=1`, `sort` (`newest`/`oldest`/`due`/`priority`). Invalid values are ignored. | own | all | all |
| `/tickets/new` | Submit ticket, which runs the "ticket created" flow | yes | yes | yes |
| `/tickets/[id]` | Details, activity thread, comment form | own only (404 otherwise) | all | all |
| `/tickets/[id]` status and assignee form | `updateTicket`, which writes audit entries | no | yes | yes |
| Comment form | `addTicketComment`; max 2000 chars | own tickets, never internal | any ticket, can mark internal | same as agent |
| `/assets` | Asset register (read-only) | yes | yes | yes |
| `/requests` | Submit an asset request; list | own | all (read) | all, approve or reject |
| `/flows` | Flow run history | read | read | read, run escalation, reset demo data |

## Server actions (`src/app/actions.ts`)
`switchPersona`, `createTicket`, `updateTicket`, `addTicketComment`, `createAssetRequest`, `decideRequest`, `runEscalation`, `resetDemoData`. Each re-checks the role itself, never trusting the UI.

## Persona switcher
Cookie `persona` holds a user id; `currentUser()` falls back to the first user (Maria, employee). This is a demo stand-in for sign-in and must be replaced before any real deployment.
