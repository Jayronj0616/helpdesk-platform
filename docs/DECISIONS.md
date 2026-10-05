# Decisions

Short records of why things are the way they are. Add a new entry when you change an approach.

## 1. Code-based clone plus a blueprint, not the real Power Platform
Power Platform runs in Microsoft's cloud and needs a tenant, so it cannot be built or committed from here. The app is structured so each part maps to a Power Platform component, and the blueprint doc explains how to build the real version. This gives a shippable portfolio piece and the vocabulary for interviews.

## 2. SQLite via libSQL behind `store.ts`
Replaced the first JSON file. `@libsql/client` runs a local file with zero setup and talks to hosted Turso with the same code, so the app can be deployed to serverless hosting later. Pages and flows still work on a plain `Database` object: `readDb()` loads it, and `mutate()` writes back only changed rows inside one write transaction. This kept all flows and their tests unchanged. The cost is that every request loads every table, which is fine for a demo and should be replaced with targeted queries if the data grows. No ORM: the schema is small, and raw SQL keeps the dependency list short.

## 3. Own email and password auth instead of a library
Auth.js v5 is still a beta and its credentials provider is deliberately minimal, so it would have meant the same custom code plus a dependency. The hand-written version is small and auditable: scrypt hashes, random session tokens stored only as hashes, HttpOnly cookies, generic login errors, rate limiting, and employee-only self-registration. For a real product with SSO (Microsoft Entra ID is what Power Platform uses), swap `lib/auth` for a provider; pages only depend on `requireUser()`.

## 4. Server components and server actions, no client data fetching
Pages read the store directly and forms post to actions. Only the login and register forms are client components (for `useActionState`). Filters are a plain GET form so views are linkable and work without JavaScript.

## 5. Flows take `db` and run inside one `mutate()`
A flow and the change that triggered it are saved together, so a ticket never exists without its flow's effects. It also keeps flows easy to unit test.

## 6. Audit trail stored as `comments` with `kind: "system"`
Reuses one table and one thread UI instead of a separate audit table. System entries are never internal, so requesters see what happened to their ticket.

## 7. Time-dependent logic lives in `queries.ts`
The React purity lint rule forbids `Date.now()` inside components, so overdue checks sit in a helper module.

## 8. Credentials and sessions live outside the Database object
Hashes and tokens are in `auth_*` tables that `readDb()` never loads, so a page cannot accidentally render or serialise them.

## 9. Self-registration creates employees only
Roles decide who can approve requests and see all tickets, so they are never self-service. Agents and managers come from the seed (or a database insert by an administrator).

## 10. First-run seed depends on DEMO_MODE
A public demo wants sample data and published logins. A real deployment must not ship known demo accounts, but it also must not start with nobody able to administer it. So `DEMO_MODE=0` creates only categories and one manager from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and refuses to start without them. The seed runs once (a `seeded` flag) and every statement is idempotent, so two server instances starting together are safe.

## 11. Admin rules are pure functions
`changeUserRole`, `createAsset` and `updateAsset` take a `Database` and return a result, like the flows do. The server actions only check the caller and call them inside `mutate`, so the rules are unit tested without a server, and the role check reads the role from the database rather than trusting the session object alone.

## 12. Managers cannot change their own role
This is the cheapest way to guarantee the last manager cannot demote themselves and leave nobody able to administer the system.

## 13. Numbered migrations instead of an ORM or auto-sync
`CREATE TABLE IF NOT EXISTS` cannot change an existing table, and a deployed database holds real data. A small `migrations.ts` (numbered, each applied in one batch with its version bump) covers it without a dependency. Schema changes go in both `migrations.ts` and `schema.ts`, and a missing users table marks a fresh database so it is not migrated.

## 14. Deactivate, never delete, users
Tickets, comments and audit entries refer to people by id, and deleting someone would either break those references or erase history. Deactivation keeps the record, blocks sign-in and assignment, and is reversible.

## 15. Rate limiting in the database
An in-memory counter resets on every serverless cold start, so on Vercel it would barely limit anything. Storing attempts in the same database (keys hashed) works across instances with no new service. It costs one extra write per attempt, which is fine for sign-in traffic. Swap in Redis only if that ever matters.

## 16. Type-aware lint for forgotten awaits
Making the limiter async turned `if (!limiter.attempt(key))` into a silent no-op that TypeScript accepts. The `no-misused-promises` and `no-floating-promises` rules now fail lint on it, and a probe file with the bug confirmed they fire.

## 17. Reset restores demo credentials
On a public demo anyone can change a demo account's password. Reset therefore re-sets the demo passwords and reactivates demo accounts, otherwise one visitor could lock everyone else out of the demo until someone fixed it by hand. This was found by the end-to-end tests.

## 18. Password reset: only when it can deliver, and no tells
A reset form that cannot send mail is worse than none, so the feature turns itself off in production without a provider and a fixed `APP_URL`. The link is built from `APP_URL`, never the request Host header, which an attacker could forge to get a victim to click a poisoned link. The response is identical for known, unknown and deactivated addresses and the work runs in `after()`, so neither the text nor the timing leaks who has an account. Tokens are random, hashed, single-use (claimed with one atomic DELETE), expire in an hour, and are cancelled by any other password change. The mailer has a development outbox so the whole flow is testable with no account, and Resend is called over plain HTTP, so there is no SDK to maintain.

## 19. Security headers without a script CSP
Simple headers and a partial CSP (framing, base URI, form targets, plugins) are cheap and safe. A CSP that restricts scripts needs per-request nonces with Next.js, which makes every page dynamic and is easy to get subtly wrong, so it is left out on purpose and noted rather than faked.

## 20. A public health endpoint
It runs the same checks a real request needs (connect, migrate, seed) and returns only `ok` or a bare 503, so a monitor or a post-deploy check can tell a broken deployment from a working one without leaking configuration.

## 21. Screenshots are generated, not hand-made
`npm run screenshots` rebuilds them from a fresh demo through the real UI, so they cannot drift from the app and anyone can refresh them.

## 22. CSV export neutralises formulas
A ticket title is typed by any employee and opened in Excel by staff, so `=HYPERLINK(...)` or `=cmd|...` would run on their machine. Every cell that starts with `=`, `+`, `-`, `@`, tab or CR gets a leading apostrophe (the standard mitigation). The export reuses the list's filter parser, so the file always matches what is on screen, and it is checked on the server (staff only), not just hidden in the UI.

## 23. One rating per ticket, by the requester only
A satisfaction number is only worth showing if it cannot be steered. So only the person who raised the ticket can rate it, only after it is resolved, and only once; staff cannot rate on a customer's behalf or change a rating. The same "Ticket not found" answer for missing and not-yours stops ticket ids being probed. The 1 to 5 range is also a database `CHECK`, so a bug cannot store 9. This was the first change to an existing table, shipped as migration 3, with tests that upgrade real version 1 and 2 shapes.

## 24. Typed partial reads instead of a query layer
Every request used to load every table, including every comment and flow run, to draw a dashboard. Rewriting all access as per-page queries would have meant new code for every page and a lot of risk. Instead `readDb([...tables])` loads only what a page names and returns a type containing only those keys, so forgetting to ask for a table is a compile error rather than a silent empty list, and the compiler found no such mistakes in the migration of all ten call sites. The ticket page loads just its own comments with an indexed query. Writes still load everything, because the diff needs it.

## 25. Reopen: resolved only, within a week, with a reason
Closed is final by design (staff close on purpose), and a resolution from last month is a different problem that deserves a new ticket, so only a recently resolved ticket can be reopened, and the requester has to say what is still wrong, which becomes the first thing the assignee reads. The SLA clock restarts because the customer's wait restarted, and the ticket goes back to its assignee only if that person is still active staff, otherwise to the queue where a manager is told. A rating given before stays, so one resolution cannot be rated twice.

## 26. Waiting on the customer pauses the SLA
A ticket parked on the customer was being escalated for a delay that was not the team's fault. Entering Waiting now records `waitingSince`, and leaving it pushes the due date back by exactly the time waited, so a due date still means "when the team has to act" and nothing is double counted. A Waiting ticket cannot be overdue, so it is never escalated. Migration 4 starts existing Waiting tickets' pause at their last update, the best the old data allows.

## 27. Time-based flows run from a protected cron endpoint
Escalation and auto-close were buttons, which is not an automation. A cron endpoint that Vercel calls on a schedule makes them real without a worker process, and it is safe to leave in the codebase because it does not exist unless `CRON_SECRET` is set and compares the secret in constant time. Auto-close and the reopen window share one constant (`REOPEN_WINDOW_DAYS`), and a test checks that for every age the flow closes exactly the tickets `canReopen` refuses, so a ticket can never be both closed and reopenable. The default schedule is daily because that is what a free Vercel plan accepts; a deploy with a more frequent schedule is rejected there.

## 28. A transactional outbox for notifications
The flows only pretended to send email. Sending inside the flow would couple every ticket update to a mail provider (a slow or failing provider would break or delay saving a ticket), and it could send mail for a change that then rolls back. So a flow only writes a row into the same transaction as its change, and a separate step delivers it. That gives "no change, no email" (tested with a rollback), retries with a visible reason, and a safe place to skip addresses that must never be mailed. The price is at-least-once delivery, which is the honest guarantee without a distributed transaction, and a small outbox table that is pruned on every write because the whole database is rewritten per save. The Teams alert stays a log line because Teams is not integrated, and the log says so instead of claiming it was sent.

## 29. Light-only, declared on purpose
On a device set to dark mode the app rendered near-black with unreadable dark text: the Next.js starter's stylesheet switched the page colours in a `prefers-color-scheme: dark` block, while every component used fixed light colours, and that unlayered `body` rule also beat Tailwind's classes (and forced Arial over the Geist font). Nothing caught it because every test and screenshot ran in light mode; it showed up the first time the app was opened in a dark-mode browser. A real dark theme means colouring every component, which is a feature of its own, so the app now says `color-scheme: light` (page, form controls and scrollbars all stay light) and a test emulates a dark device and checks background, text, controls, contrast and font. If dark mode is wanted later, build it as a feature with that test turned into its expected-dark twin.

## 30. Small commits
The owner wants one logical change per commit (it also reads well in history and helps their GitHub contribution graph).
