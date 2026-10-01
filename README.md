# HelpDesk Platform

An IT helpdesk and asset tracker built with Next.js. It is structured like a Microsoft Power Platform solution, so every piece has a direct equivalent in Dataverse, Power Apps, Power Automate and Power BI.

| Layer | Here | Power Platform |
|---|---|---|
| Data | `src/lib/dataverse` (tables, seed, store) | Dataverse |
| Apps | `src/app/**` (employee form, agent views) | Canvas and model-driven apps |
| Automation | `src/lib/flows` + `/flows` run history | Power Automate |
| Reporting | Dashboard (`/`) | Power BI |
| Security | Persona switcher, role checks, row filtering | Security roles |

## What it does

- **Tickets**: employees submit them, and agents and managers work them. Employees only see their own tickets.
- **Flow: When a ticket is created**: sets the SLA from the priority, assigns the agent with the fewest open tickets, and alerts the manager on critical tickets.
- **Flow: Escalate overdue tickets**: bumps the priority of tickets past their SLA (manager only).
- **Flow: Asset request approval**: managers approve or reject. Approving assigns an available asset from stock.
- **Flow runs**: every run and the actions it took.

Use the **Signed in as** switcher in the header to try each role (employee, agent, manager).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Data lives in `data/db.json`, which is created from the seed on first run. Use "Reset demo data" on the Flow runs page (manager) to restore it.

## Build the real thing

[docs/POWER-PLATFORM-BLUEPRINT.md](docs/POWER-PLATFORM-BLUEPRINT.md) is a step-by-step guide to rebuilding this system in the actual Power Platform: tables, security roles, canvas and model-driven apps, flows with expressions, a Power BI report, and a study order.

## Notes

This is a portfolio demo. The persona switcher is not real authentication, and the JSON file store is for local use only. To go further, replace `src/lib/dataverse/store.ts` with a real database and the persona with real sign-in.
