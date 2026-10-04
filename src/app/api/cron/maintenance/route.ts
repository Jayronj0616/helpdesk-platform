import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { mutate } from "@/lib/dataverse/store";
import { runMaintenance } from "@/lib/flows";

// Runs the time-based flows (escalate overdue tickets, close old resolved ones) on a schedule. Vercel Cron
// calls this with "Authorization: Bearer <CRON_SECRET>" when the CRON_SECRET environment variable is set
// (see vercel.json). Without CRON_SECRET the endpoint does not exist, so it can never be left open by mistake.
export const dynamic = "force-dynamic";

const digest = (value: string) => crypto.createHash("sha256").update(value).digest();

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("Not found", { status: 404 });

  // Compare hashes in constant time, so the secret cannot be guessed one character at a time from response timing.
  const given = request.headers.get("authorization") ?? "";
  if (!crypto.timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const result = await mutate((db) => runMaintenance(db));
  return NextResponse.json({ status: "ok", ...result }, { headers: { "Cache-Control": "no-store" } });
}
