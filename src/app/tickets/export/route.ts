import { toCsv } from "@/lib/csv";
import { filterTickets, parseTicketFilters } from "@/lib/dataverse/queries";
import { readDb } from "@/lib/dataverse/store";
import { canWorkTickets, currentUser } from "@/lib/session";

// CSV of the tickets matching the same filters as the list (staff only). Everything is exported, not just
// the current page.
export const dynamic = "force-dynamic";

const iso = (s: string | null) => (s ? new Date(s).toISOString() : "");

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Sign in first.", { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!canWorkTickets(user)) return new Response("Only IT staff can export tickets.", { status: 403, headers: { "Cache-Control": "no-store" } });

  const db = await readDb();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const tickets = filterTickets(db, db.tickets, parseTicketFilters(params, db));
  const person = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? "";

  const csv = toCsv(
    ["Number", "Title", "Description", "Requester", "Assignee", "Category", "Priority", "Status", "Created", "Due", "Resolved", "Escalated", "Asset", "Rating", "Rating comment"],
    tickets.map((t) => [
      t.number,
      t.title,
      t.description,
      person(t.requesterId),
      person(t.assigneeId),
      db.categories.find((c) => c.id === t.categoryId)?.name ?? "",
      t.priority,
      t.status,
      iso(t.createdAt),
      iso(t.dueAt),
      iso(t.resolvedAt),
      t.escalated ? "yes" : "no",
      db.assets.find((a) => a.id === t.assetId)?.tag ?? "",
      t.rating,
      t.ratingComment,
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
