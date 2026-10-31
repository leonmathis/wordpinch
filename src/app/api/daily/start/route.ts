import { NextResponse } from "next/server";
import { startDaily } from "@/lib/daily";
import { sessionUserId } from "@/lib/supabase/identity";

/**
 * F6: reveals today's letters to the caller and starts their clock (the
 * server's time). A second call returns the same start: one try per day.
 * Needs an anonymous account (F1); body: { name?: string } for the board.
 */
export async function POST(request: Request) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let name = "";
  try {
    const body = (await request.json()) as { name?: unknown };
    if (typeof body?.name === "string") name = body.name;
  } catch {
    /* no body: the board says "Someone" */
  }
  try {
    return NextResponse.json(await startDaily(userId, name), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[POST /api/daily/start]", err);
    return NextResponse.json({ error: "Failed to start" }, { status: 500 });
  }
}
