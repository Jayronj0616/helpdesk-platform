# Decisions

Short records of why things are the way they are. Add a new entry when you change an approach.

## 1. Code-based clone plus a blueprint, not the real Power Platform
Power Platform runs in Microsoft's cloud and needs a tenant, so it cannot be built or committed from here. The app is structured so each part maps to a Power Platform component, and the blueprint doc explains how to build the real version. This gives a shippable portfolio piece and the vocabulary for interviews.

## 2. JSON file store behind `store.ts`
Zero setup for anyone cloning the repo. Only `store.ts` touches the file, so swapping in a real database later does not change pages or flows. Not safe for concurrent writes or hosting on read-only filesystems (such as Vercel).

## 3. Persona switcher instead of authentication
Lets a reviewer try all three security roles in seconds. Every server action still re-checks the role. Must be replaced before real deployment.

## 4. Server components and server actions, no client data fetching
Pages read the store directly and forms post to actions. Only `PersonaSwitcher` is a client component. Filters are a plain GET form so views are linkable and work without JavaScript.

## 5. Flows take `db` and run inside one `mutate()`
A flow and the change that triggered it are saved together, so a ticket never exists without its flow's effects. It also keeps flows easy to unit test.

## 6. Audit trail stored as `comments` with `kind: "system"`
Reuses one table and one thread UI instead of a separate audit table. System entries are never internal, so requesters see what happened to their ticket.

## 7. Time-dependent logic lives in `queries.ts`
The React purity lint rule forbids `Date.now()` inside components, so overdue checks sit in a helper module.

## 8. Small commits
The owner wants one logical change per commit (it also reads well in history and helps their GitHub contribution graph).
