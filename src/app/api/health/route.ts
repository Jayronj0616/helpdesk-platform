import { NextResponse } from "next/server";
import { getDb } from "@/lib/dataverse/db";
import { ensureSeeded } from "@/lib/dataverse/store";

// Public on purpose, for uptime monitors and a post-deploy check. It reveals nothing but whether the
// database is reachable, migrated and seeded (a missing ADMIN_EMAIL in production shows up here as a 503).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    await (await getDb()).execute("SELECT 1");
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("health check failed:", err);
    return NextResponse.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
