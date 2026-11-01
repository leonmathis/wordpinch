import { NextResponse } from "next/server";
import { dailyStatus } from "@/lib/daily";
import { sessionUserId } from "@/lib/supabase/identity";

/**
 * F6: today's daily pinch for the caller. The letters only come back once
 * this player has started (POST /api/daily/start), so nobody can read them
 * before their clock runs. Never signs anyone in.
 */
export async function GET() {
  try {
    const status = await dailyStatus(await sessionUserId());
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[GET /api/daily]", err);
    return NextResponse.json({ error: "Failed to load the daily pinch" }, { status: 500 });
  }
}
