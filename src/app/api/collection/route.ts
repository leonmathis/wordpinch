import { NextResponse } from "next/server";
import { listCollection } from "@/lib/collection";
import { sessionUserId } from "@/lib/supabase/identity";

/**
 * The caller's word collection (F2), newest first. Read with the caller's
 * session, so RLS returns only their own rows. A visitor without a session
 * has an empty collection; this route never signs anyone in.
 *
 * Response (200): { words: CollectedWord[] }
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (!(await sessionUserId())) return NextResponse.json({ words: [] }, { headers });
    return NextResponse.json({ words: await listCollection() }, { headers });
  } catch (err) {
    console.error("[GET /api/collection]", err);
    return NextResponse.json({ error: "Failed to load your words" }, { status: 500 });
  }
}
