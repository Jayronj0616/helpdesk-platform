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

## 10. Small commits
The owner wants one logical change per commit (it also reads well in history and helps their GitHub contribution graph).
