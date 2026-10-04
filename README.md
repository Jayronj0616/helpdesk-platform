# HelpDesk Platform

An IT helpdesk and asset tracker built with Next.js. It is structured like a Microsoft Power Platform solution, so every piece has a direct equivalent in Dataverse, Power Apps, Power Automate and Power BI.

| Layer | Here | Power Platform |
|---|---|---|
| Data | `src/lib/dataverse` (tables, seed, store) | Dataverse |
| Apps | `src/app/**` (employee form, agent views) | Canvas and model-driven apps |
| Automation | `src/lib/flows` + `/flows` run history | Power Automate |
| Reporting | Dashboard (`/`) | Power BI |
| Security | Email and password sign-in, sessions, role checks, row filtering | Security roles, Entra ID sign-in |

## What it does

- **Tickets**: employees submit them, and agents and managers work them. Employees only see their own tickets.
- **Flow: When a ticket is created**: sets the SLA from the priority, assigns the agent with the fewest open tickets, and alerts the manager on critical tickets.
- **Flow: Escalate overdue tickets**: bumps the priority of tickets past their SLA (manager only).
- **Flow: Asset request approval**: managers approve or reject. Approving assigns an available asset from stock.
- **Flow runs**: every run and the actions it took.

Sign in as any demo account (listed on the login page) to try each role: employee, agent or manager. You can also register a new employee account.

## Docs

Project docs live in [docs/](docs/INDEX.md): current state, progress tracker, structure, data model, features and permissions, flows, testing and design decisions. `AGENTS.md` and `CLAUDE.md` point AI coding tools at them.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. The SQLite database (`data/helpdesk.db`) is created and seeded on first use. Demo accounts and their password are shown on the login page. Copy `.env.example` to `.env.local` to change the database, the demo password, or to turn demo mode off. Run `npm test` for the test suite.

## Build the real thing

[docs/POWER-PLATFORM-BLUEPRINT.md](docs/POWER-PLATFORM-BLUEPRINT.md) is a step-by-step guide to rebuilding this system in the actual Power Platform: tables, security roles, canvas and model-driven apps, flows with expressions, a Power BI report, and a study order.

## Notes

This is a portfolio demo. Authentication is hand-written (scrypt hashes, hashed session tokens, HttpOnly cookies, rate-limited sign-in) and suits a demo or a small internal tool; for a product, use your identity provider. The demo accounts share a published password, so turn off `DEMO_MODE` and change `DEMO_PASSWORD` before putting this anywhere public that holds real data. To deploy, point `DATABASE_URL` at a hosted libSQL/Turso database, because serverless hosts have no writable disk.
