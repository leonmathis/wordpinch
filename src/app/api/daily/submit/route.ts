import { NextResponse } from "next/server";
import { submitDaily } from "@/lib/daily";
import { sessionUserId } from "@/lib/supabase/identity";

/**
 * F6: the caller's word for today. A word that counts stops the clock
 * (server time) and lands in the collection; anything else comes back with
 * a reason and the clock keeps running. Body: { word: string }.
 * 200 { status } · 422 { error: reason } · 409 not_started / done.
 */
export async function POST(request: Request) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let word: unknown;
  try {
    word = ((await request.json()) as { word?: unknown }).word;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof word !== "string" || word.length > 50) {
    return NextResponse.json({ error: "word must be a string" }, { status: 400 });
  }
  try {
    const r = await submitDaily(userId, word);
    if (r.ok) return NextResponse.json({ status: r.status }, { headers: { "Cache-Control": "no-store" } });
    const status = r.reason === "not_started" || r.reason === "done" ? 409 : 422;
    return NextResponse.json({ error: r.reason }, { status });
  } catch (err) {
    console.error("[POST /api/daily/submit]", err);
    return NextResponse.json({ error: "Failed to check your word" }, { status: 500 });
  }
}
