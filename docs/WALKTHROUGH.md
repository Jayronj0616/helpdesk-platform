# Walkthrough

A guided tour of HelpDesk Platform: about ten minutes for a demo or an interview, or an hour if you want to try everything. It follows the three kinds of user, then lists what to say about what is underneath. Pictures of the main screens are in [the README](../README.md#screenshots).

## Before you start
- Run it with `npm run dev` and open http://localhost:3000, or open the deployed site.
- The sign-in page lists five demo accounts. They all share the password shown there (`helpdesk-demo` unless it was changed).

| Account | Role | Sees |
|---|---|---|
| `maria@contoso.test`, `carlo@contoso.test` | Employee | Only their own tickets and requests |
| `ana@contoso.test`, `ben@contoso.test` | Agent (IT staff) | All tickets, assets, reports |
| `dina@contoso.test` | Manager | Everything, plus approvals, users, categories, audit log |

- To start again at any time, sign in as Dina, open **Flow runs** and press **Reset demo data** (it also restores the demo passwords). The audit log is deliberately not reset.

---

## 1. As an employee (Maria)
1. **Dashboard.** Only Maria's tickets are counted ("your tickets only"). *Point out:* the same page shows everything to staff; the filtering is done on the server, not by hiding things.
2. **Raise a ticket** (Tickets, New ticket). Pick a priority and notice the SLA hours beside each. *What happens next:* a flow sets the due date from the priority, assigns the agent with the fewest open tickets, and queues an email to them. You can see it on **Flow runs** when signed in as the manager.
3. **Open ticket #1001.** Read the activity: public comments, and system lines such as "Ana Cruz changed status...". The agent's *internal note* is not shown to Maria, and that is enforced on the server. Add a comment.
4. **Rate and reopen.** Ticket #1003 is resolved. Maria can *rate* it 1 to 5 (once only), or if it isn't fixed, *reopen* it within 7 days with a reason. Reopening restarts the SLA clock and tells the assignee.
5. **Request equipment** (Asset requests). It waits for manager approval.
6. **Account.** Edit your name and department. Email and role are not editable (the email is your sign-in; only a manager changes a role). Change your password: it needs the current one and signs out your other devices.
7. **Forgot password** (sign-in page). The reply is the same whether or not the email exists. Without an email provider, in development, the message appears at `/dev/outbox`.

*Try to break it:* open another person's ticket by its URL (404, not "forbidden", so it doesn't reveal that the ticket exists), or open `/admin/users` (404).

## 2. As an agent (Ana or Ben)
1. **Tickets.** Everyone's tickets. Use the search box (number, title, description, requester), the filters and sort. The URL holds the filters, so a view can be shared. **Export CSV** downloads the filtered list; titles that start with `=` are neutralised so a spreadsheet can't run them.
2. **Work a ticket.** Change status, assignee and related asset, and each change appears in the history. Add an **internal note** (tick the box): staff see it, the requester doesn't.
3. **Waiting pauses the SLA.** Set a ticket to *Waiting*: its due date shows "Paused" and it can't be escalated. Set it back to *In progress* and the due date moves later by exactly the time waited, and the history says so.
4. **Assets.** Add an asset (tag, name, type) and change status and holder.
5. **Reports.** SLA met, resolution time, first-reply time, satisfaction, a 14-day chart, and tables by person, category and priority. Change the period. The definitions are under the report.

## 3. As the manager (Dina)
1. **Asset requests.** Approve Maria's request. A flow assigns an available asset and queues an email.
2. **Flow runs.** Every automation run with what it did. Press **Escalate overdue tickets** and **Close resolved tickets**. The **Email queue** shows each email, whether it was sent, and failures with the reason. *Point out:* a flow only queues the email, in the same database step as the change, so a change that fails never sends mail; a separate step delivers it with retries.
3. **Categories.** Add, rename (every ticket follows) and delete a category. One in use can't be deleted.
4. **Users.** Create an agent, change someone's role, reset a password (signs them out), or deactivate an account. Deactivating signs them out at once and frees their open tickets. You can't change or deactivate yourself, so the last manager can't lock everyone out.
5. **Audit log.** The record of everything in steps 1 to 4: who, what, about whom, when. It can be filtered by kind of action, and entries can't be edited or deleted.

---

## What is underneath (talking points)
- **Shape.** It is built like a Power Platform solution, so each part has a counterpart: tables are Dataverse, the employee form and agent views are canvas and model-driven apps, flows are Power Automate, the reports are Power BI, security is security roles. [The blueprint](POWER-PLATFORM-BLUEPRINT.md) shows how to build the real version in Microsoft's tools.
- **Security.** Passwords are hashed with scrypt; sessions are random tokens stored only as hashes in an HttpOnly cookie; sign-in, reset and registration are rate limited; wrong email and wrong password look the same; every action re-checks the role on the server; reset links are single-use and expire; the CSV export defends against formula injection; responses carry security headers.
- **Correctness.** Business rules are small pure functions tested with fixed dates. Changes and their emails and audit entries are saved in one transaction. The database has foreign keys and CHECK constraints, and schema changes ship as numbered migrations, tested by upgrading old database shapes.
- **Quality bar.** Several hundred unit tests, browser tests in a real Chrome (including dark-mode and accessibility checks), type-aware lint that catches forgotten `await`s, and CI on every push. Several bugs were found by the tests and are written up in [the decisions](DECISIONS.md): a rate limiter that never limited, a form that kept an old filter after "Clear", black-on-black text on dark-mode devices.
- **Honest limits.** It is light-only; email needs a provider and a domain; the Teams alert is a log line; it has never run against a real hosted database; the whole database is rewritten per save, which is fine for hundreds of tickets, not millions.

## A five-minute version
1. Sign in as Maria, raise a ticket. 2. Sign in as Dina, show **Flow runs**: the assignment and the queued email. 3. Sign in as Ana, put it in *Waiting* and show the SLA pause; add an internal note. 4. Back as Maria, show she can't see the note. 5. As Dina, open **Reports** and the **Audit log**.

## Questions you may be asked
- *Why not use the real Power Platform?* It needs a Microsoft tenant, so the code version proves the design and the blueprint shows the mapping.
- *Why SQLite?* The same code runs on a local file and on hosted libSQL (Turso), which is what makes a free deploy possible.
- *Why no framework for login?* The sign-in needs are small and security-sensitive, so the code is short enough to audit and fully tested; a real product with single sign-on would swap it for the identity provider, and nothing else changes because pages only call `requireUser()`.
- *What would you do next?* A real dark theme, notification preferences, and targeted write statements once the data grows.
