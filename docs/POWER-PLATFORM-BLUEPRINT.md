# Building HelpDesk in the real Microsoft Power Platform

This guide rebuilds the code project in this repo with the actual Power Platform tools. Each section says which part of the Next.js app it replaces, so you can explain both versions in an interview.

## 0. Get an environment (free)

1. Sign up for the **Power Apps Developer Plan**: https://powerapps.microsoft.com/developerplan/
   It needs a work or school account. If you only have a personal Gmail, join the **Microsoft 365 Developer Program** or ask your school for an account.
2. Open https://make.powerapps.com and make sure the environment in the top right is your **Developer** environment (not "Default").
3. Create a **Solution** named `HelpDesk` (Solutions > New solution, publisher: create one with prefix `hd`). Build everything inside it. Solutions are how you move apps between environments, which is a common interview topic.

## 1. Dataverse tables (replaces `src/lib/dataverse/types.ts`)

Create these in the solution (New > Table). Use the display names below; Dataverse adds the `hd_` prefix.

| Table | Key columns | Notes |
|---|---|---|
| **Category** | Name (text) | Reference data |
| **Ticket** | Number (autonumber, prefix `TKT-`), Title (text), Description (multiline), Priority (choice: Low, Medium, High, Critical), Status (choice: New, In progress, Waiting, Resolved, Closed), Category (lookup), Requester (lookup to User), Assignee (lookup to User), Related Asset (lookup), Due At (date and time), Resolved On (date and time), Escalated (yes/no) | The main table |
| **Ticket Comment** | Ticket (lookup, required), Body (multiline), Author (lookup to User, empty for system entries), Kind (choice: Comment, System), Internal (yes/no) | Activity thread and audit trail. Alternatively use the built-in **Notes** (Annotations) or **Posts** feature for public comments; keep this table when you need the Internal flag. |
| **Asset** | Tag (text, unique), Name (text), Type (choice), Status (choice: Available, Assigned, Repair, Retired), Assigned To (lookup to User), Purchased On (date) | Inventory |
| **Asset Request** | Asset Type (choice), Justification (multiline), Requester (lookup), Status (choice: Pending, Approved, Rejected), Decided By (lookup), Decided On (date and time) | Drives the approval flow |

Relationships: Ticket -> Category (many-to-one), Ticket -> Asset (many-to-one), Asset Request -> User, Ticket -> User (two lookups).

**Security roles** (replaces `src/lib/session.ts`). Settings > Security roles:
- **HelpDesk Employee**: Ticket and Asset Request: Create, Read, Write at *User* level (they only see rows they own). Asset and Category: Read at *Organization* level.
- **HelpDesk Agent**: Ticket and Asset: Create, Read, Write at *Business unit* level.
- **HelpDesk Manager**: everything the Agent has, plus Write on Asset Request (to approve), at *Organization* level.

**Sign-in:** the code project has its own email and password login. In Power Platform you get this for free: users sign in with their Microsoft Entra ID (Azure AD) account, and you assign them to security roles (directly or through an Entra group-backed team). There is no password or session code to write, which is a big reason organisations choose it.

**User administration:** the `/admin/users` page has no code equivalent in Power Platform. Users come from Entra ID and are added to the environment, then given security roles in the Power Platform admin center (or automatically through an Entra group-backed team). Assets and their status are just a Dataverse table edited in the model-driven app.

Interview point: the three access levels (User, Business unit, Organization) are how Dataverse does row-level security. This is what `canWorkTickets` and the "employees only see their own tickets" filters mimic.

Internal notes need a security rule too: in the model-driven app, put internal comments in a view filtered to `Internal = No` for the Employee role (a separate view or a security role that has no read access to the Internal column through **column-level security**). Interview point: column security profiles hide a single field from certain roles, which is how "internal notes" works here.

Add a **business rule** on Ticket (table > Business rules): if Status is Resolved or Closed, set Resolved On to now. This replaces the `resolvedAt` handling in `updateTicket`.

## 2. Apps (replaces `src/app/**/page.tsx`)

### 2a. Model-driven app "HelpDesk Agent Console" (agents and managers)
Create > App > Model-driven. Add the Ticket, Asset and Asset Request tables. The views, forms and charts come from the tables.

- **Ticket view** "Open tickets": filter Status not in (Resolved, Closed), sort by Due At. (Replaces `/tickets`.)
- **Ticket main form**: tabs for Details and Related. Put Status and Assignee in the header. (Replaces `/tickets/[id]`.)
- **Dashboard** (App designer > Dashboards): three charts on the Ticket table: count by Status, count by Category, count by Priority. (Replaces the Bars on `/`.)
- Asset and Asset Request tables give you `/assets` and `/requests` with no extra work.

### 2b. Canvas app "HelpDesk Portal" (employees)
Create > App > Canvas, phone or tablet layout, connect to Dataverse. Three screens:

1. **Home**: a gallery of the current user's tickets.
   ```
   Items: Filter(Tickets, Requester.'Primary Email' = User().Email)
   ```
2. **New ticket**: an edit form.
   ```
   // Submit button
   SubmitForm(frmTicket)
   // frmTicket OnSuccess
   Notify("Ticket submitted", NotificationType.Success); Navigate(scrHome)
   ```
   Add a dropdown for Priority and a label that shows the SLA for the chosen priority:
   ```
   Switch(ddPriority.Selected.Value, "Critical", "4h", "High", "8h", "Medium", "24h", "72h")
   ```
3. **Request equipment**: a form for Asset Request, with the same Notify pattern.

This is the equivalent of `/tickets/new` and `/requests`. Interview point: canvas apps are free-form with Power Fx formulas; model-driven apps are generated from the data model. Employees get the canvas app because it is simpler and mobile-friendly, and agents get the model-driven app because it is data-heavy.

## 3. Power Automate flows (replaces `src/lib/flows/index.ts`)

Create these in the solution (New > Automation > Cloud flow).

### Flow 1: "When a ticket is created" (Automated cloud flow)
- **Trigger**: Dataverse, *When a row is added* (table: Ticket, scope: Organization).
- **Actions**:
  1. *Compose* `SLA hours` with
     ```
     if(equals(triggerOutputs()?['body/hd_priority'],3),4,if(equals(triggerOutputs()?['body/hd_priority'],2),8,if(equals(triggerOutputs()?['body/hd_priority'],1),24,72)))
     ```
     (Choice columns return numbers; check yours in the table settings.)
  2. *Update a row* on Ticket: Due At = `addHours(utcNow(), outputs('SLA_hours'))`.
  3. *List rows* on Ticket, filter `_hd_assignee_value ne null and hd_status ne 4 and hd_status ne 5`, then *Select* + *Compose* to count per agent (or simplify to round-robin with a counter row).
  4. *Update a row*: Assignee = the agent with the fewest open tickets, Status = In progress.
  5. *Send an email (V2)* (Office 365 Outlook) to the assignee.
  6. *Condition*: Priority is Critical -> *Post message in a chat or channel* (Teams) to the manager.

### Flow 2: "Escalate overdue tickets" (Scheduled cloud flow)
- **Trigger**: Recurrence, every 1 hour.
- **Actions**: *List rows* on Ticket with the filter `hd_dueat lt @{utcNow()} and hd_escalated eq false and hd_status ne 4 and hd_status ne 5`. Then *Apply to each*: *Update a row* (priority +1, Escalated = Yes) and *Send an email* to the manager.

### Flow 3: "Asset request approval" (Approval flow)
- **Trigger**: Dataverse, *When a row is added* (Asset Request).
- **Actions**:
  1. *Start and wait for an approval* (type: Approve/Reject, assigned to the manager). Details: the justification.
  2. *Condition* on the outcome:
     - **Approve**: *List rows* on Asset where Type matches and Status = Available (top count 1). If a row exists, *Update a row* (Status = Assigned, Assigned To = requester); otherwise *Create a row* in a Planner or a task list for purchasing. Update the request Status to Approved. *Send an email* to the requester.
     - **Reject**: update the request Status to Rejected and *Send an email*.

**Audit trail:** in Flows 1 and 2, add a *Add a new row* action on Ticket Comment (Kind = System, Internal = No) describing what the flow did. This is what the "Activity" thread shows on each ticket.

Interview points: approvals show up for the manager in Teams, Outlook and the Power Automate Approvals center with no extra UI work. Use **Run history** to debug (this is what the `/flows` page imitates). Put connection references and environment variables in the solution so it deploys cleanly.

## 4. Power BI report (replaces the dashboard KPI tiles)

1. In Power BI Desktop: Get data > **Dataverse**, pick Ticket, Asset and Category, import mode.
2. Add a **Measures** table with DAX:
   ```
   Open Tickets = CALCULATE(COUNTROWS(Ticket), Ticket[Status] IN {"New", "In progress", "Waiting"})
   SLA Breached = CALCULATE(COUNTROWS(Ticket), Ticket[Due At] < NOW(), Ticket[Status] IN {"New", "In progress", "Waiting"})
   Avg Resolution Hours = AVERAGEX(FILTER(Ticket, NOT ISBLANK(Ticket[Resolved On])), DATEDIFF(Ticket[Created On], Ticket[Resolved On], HOUR))
   ```
3. Visuals: 4 cards (the measures plus pending requests), a bar chart of tickets by Category, a donut of Assets by Status, a line chart of tickets per day.
4. Publish to your workspace. Embed it in the model-driven app dashboard (Add > Power BI) if the licence allows, or pin it to Teams.

## 5. Suggested study order

1. Dataverse basics: tables, columns, lookups, choices (Microsoft Learn: *Get started with Microsoft Dataverse*).
2. Build the model-driven app first, since it needs the least code.
3. Canvas app and Power Fx: gallery, forms, `Filter`, `LookUp`, `Patch`, `Navigate`, `Notify`.
4. Power Automate: triggers, `Apply to each`, expressions, error handling (*Configure run after*), approvals.
5. Solutions, environments (Dev/Test/Prod) and ALM basics.
6. Power BI measures with DAX, only after the above.

Microsoft's certification that matches this work is **PL-900 (Power Platform Fundamentals)**, then **PL-200 (Functional Consultant)** or **PL-400 (Developer)**.

## 6. Mapping cheat sheet

| This repo | Power Platform |
|---|---|
| `src/lib/dataverse/*` | Dataverse tables, relationships, business rules |
| `src/lib/session.ts` roles | Security roles and access levels |
| `src/app/tickets/new`, `/requests` (employee side) | Canvas app |
| `src/app/tickets`, `/assets`, `/tickets/[id]` | Model-driven app views and forms |
| `src/app/page.tsx` | Model-driven dashboard / Power BI report |
| `src/lib/flows/index.ts` | Power Automate cloud flows |
| `src/app/flows` | Flow run history |
| `data/db.json` | Dataverse environment database |
