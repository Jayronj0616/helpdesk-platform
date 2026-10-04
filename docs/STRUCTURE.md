# System structure

Read this before changing code. Keep it updated when files are added, moved or removed.

## Stack
Next.js 16 (App Router, server components, server actions), TypeScript, Tailwind v4, SQLite through `@libsql/client` (local file, or hosted Turso with the same code). No client-side data fetching. Pages read the store directly, and forms post to server actions.

Next.js 16 has breaking changes. Check `node_modules/next/dist/docs/` before using an API you are unsure about. `params` and `searchParams` are Promises, and the typed helpers are `PageProps<"/route">` and `LayoutProps<"/">`.

## Layout

```
src/
  app/
    layout.tsx            Shell: nav (shown only when signed in)
    page.tsx              Dashboard (Power BI analog)
    actions.ts            ALL data mutations (server actions). Auth and role checks live here.
    auth-actions.ts       login, register, logout, change own password (rate limited, generic errors)
    admin-actions.ts      Manager-only: create user, change role, reset a user's password
    login/page.tsx        Sign in, plus demo account hints when DEMO_MODE is on
    register/page.tsx     Self-registration (always creates an employee)
    forgot-password/      Request a reset link (404 when email is not available)
    reset-password/[token]/  Choose a new password from an emailed link
    dev/outbox/page.tsx   Development mail catcher (404 in production or with a provider)
    api/health/route.ts   Public health check for monitors and post-deploy checks
    account/page.tsx      Own profile and password change
    admin/users/page.tsx  User administration (managers only, 404 for everyone else)
    tickets/
      page.tsx            Ticket list with search, filters, sorting, pagination
      new/page.tsx        Submit ticket form (canvas app analog)
      [id]/page.tsx       Ticket detail, status/assignee/asset edit, comment thread
    assets/page.tsx       Asset register; staff can add assets and change status and holder
    requests/page.tsx     Asset request approval workflow
    flows/page.tsx        Flow run history, manual flow triggers
  components/
    Nav.tsx               Top nav with the signed-in user and Sign out
    AuthForms.tsx         Client components: LoginForm, RegisterForm (useActionState)
    ResetForms.tsx        Client forms: ForgotPasswordForm, ResetPasswordForm
    ActionForms.tsx       Client forms: CreateUserForm, ResetPasswordForm, AddAssetForm, ChangePasswordForm
    ui.tsx                Badge, Card, PageTitle, class constants, label(), fmt()
  lib/
    dataverse/
      types.ts            Table types, SLA_HOURS, PRIORITIES. Source of truth for the data model.
      schema.ts           SQL table specs (columns, constraints, load order), auth table DDL
      db.ts               libSQL client singleton; creates tables and runs migrations on connect
      migrations.ts       Numbered schema migrations for existing databases (version kept in meta)
      store.ts            readDb, mutate (write transaction, diff write-back), resetDb, newId, first-run seed
      seed.ts             Demo data
      queries.ts          Pure helpers over rows (isOpen, isOverdue, filterTickets, paginate, ticketsPerDay)
      admin.ts            Pure rules: changeUserRole, createAsset, updateAsset, requestTypes
      comments.ts         addComment, addSystemEntry (audit trail), visibleComments (hides internal notes)
    auth/
      password.ts         scrypt hash and verify
      credentials.ts      authenticate, createAccount (any role, admin only), registerUser (employee), setPassword, changeOwnPassword
      sessions.ts         createSession, getSessionUser, destroySession, destroyUserSessions (hashed tokens in SQL)
      reset.ts            createResetToken, isResetTokenValid, consumeResetToken (single use, hashed, expiring)
      rate-limit.ts       Database-backed sliding-window limiter (hashed keys) for login, register, password change
    flows/index.ts        Automation flows (Power Automate analog). Each logs a FlowRun.
    mail.ts               sendMail (Resend provider, dev outbox, or off), mailMode, appUrl, passwordResetAvailable
    session.ts            currentUser, requireUser, startSession/endSession (cookie), role checks
    config.ts             DEMO_MODE, DEMO_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD (from env)
    form-state.ts         FormState type for useActionState actions
e2e/                      Playwright end-to-end tests (real Chrome, real dev server, throwaway database)
.github/workflows/ci.yml  CI: lint, types, unit tests, build; and the e2e tests on a runner with Chrome
playwright.screenshots.config.ts  `npm run screenshots`: regenerates docs/screenshots/*.png from a fresh demo
e2e/screenshots/         The capture script (`*.shots.ts`, not part of the e2e run)
docs/screenshots/         Images shown in the README
playwright.config.ts      Playwright config: port 3210, temp SQLite file, one worker
tests/                    Vitest: queries, comments, flows, admin rules (pure); password, db, accounts, production seed (real SQLite files: password, db, accounts, rate-limit, migrations, production seed, reset, health; mail with stubbed env)
vitest.config.mts         Test config (resolves the @ alias)
.env.example              DATABASE_URL, DATABASE_AUTH_TOKEN, DEMO_MODE, DEMO_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
docs/
  INDEX.md                Which doc answers which question
  HANDOFF.md              Current state and next step. Rewrite every session.
  PROGRESS.md             Task tracker. Update after every task.
  STRUCTURE.md            This file
  DATA-MODEL.md           Tables, enums, visibility rules, auth tables
  FEATURES.md             Routes, permissions, server actions, authentication
  FLOWS.md                Automation flows
  TESTING.md              Checks and manual test script
  DECISIONS.md            Why it is built this way
  DEPLOY.md               Vercel + Turso deployment, modes, caveats
  POWER-PLATFORM-BLUEPRINT.md   Guide to rebuilding this in the real Power Platform
AGENTS.md, CLAUDE.md      Auto-loaded by AI tools; point at docs/
data/helpdesk.db          Local SQLite database, gitignored, created and seeded on first use
```

## How data flows
1. A page calls `requireUser()` (redirects to `/login` if there is no valid session), then `await readDb()` to get a plain `Database` object.
2. A server action calls `requireUser()`, checks the role, then `await mutate((db) => { ... })`. `mutate` opens a write transaction, loads the `Database`, runs your function, and writes back only the rows that changed. If your function throws, everything rolls back.
3. Flows are plain functions over the `db` object, called from inside `mutate`, so a change and its flow effects commit together.
4. Password hashes and session tokens live in `auth_*` tables that are never loaded into the `Database` object.

## Conventions
- **Mutations** go in `src/app/actions.ts` only (auth in `auth-actions.ts`). Each action calls `requireUser()`, checks the role, validates and length-limits input, mutates via `mutate()`, then calls `revalidatePath`.
- **Never trust the form**: re-check every id against the database inside `mutate` (category exists, assignee is staff, asset is allowed for the user).
- **Role checks**: `canWorkTickets` (agent or manager) and `canApprove` (manager) in `session.ts`. Employees can only see their own tickets, enforced in list pages and in `tickets/[id]` (404).
- **Pure logic** (filtering, overdue checks) lives in `lib/dataverse/queries.ts`. The `react-hooks/purity` lint rule forbids `Date.now()` in components, so anything time-dependent goes there.
- **Automations** go in `lib/flows/index.ts`, take the `db` object, and call `logRun`.
- **Adding a table**: update `types.ts` and `schema.ts` together (every field of a row type needs a column), seed it in `seed.ts`, set an `orderBy` that matches how code expects the array ordered, add tests, and update `DATA-MODEL.md` and the blueprint. New tables are created automatically on connect.
- **Adding or changing a column on an existing table**: `CREATE TABLE IF NOT EXISTS` never alters a table, so add a numbered migration to `migrations.ts` (never edit a released one) **and** the column to `schema.ts`, so new databases are created with it. Add a test in `tests/migrations.test.ts`.
- **Async calls must be awaited**: `readDb`, `mutate`, the limiter and the auth functions return Promises, and the type-aware lint rules fail the build if one is forgotten.
- **UI**: reuse `ui.tsx` primitives. Every form control needs a label or `aria-label`.
- **Commits**: small, one logical change each, with a clear message.

## Verify before committing
```bash
npx eslint . && npm run typecheck && npm test && npm run build
npm run test:e2e   # when pages, actions or auth changed
```
