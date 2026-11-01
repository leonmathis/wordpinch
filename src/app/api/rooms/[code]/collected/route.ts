import { NextResponse } from "next/server";
import { getRoomByCode, isValidCode } from "@/lib/rooms";
import { countCollectedSince } from "@/lib/collection";
import { sessionUserId } from "@/lib/supabase/identity";

type Params = { params: Promise<{ code: string }> };

/**
 * How many words the caller added to their collection during this room's
 * current match (F2 match-end banner). Words already in the collection
 * before the match don't count as new. 0 without a session.
 *
 * Response (200): { count: number }
 */
export async function GET(_request: Request, { params }: Params) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  if (!isValidCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }
  const headers = { "Cache-Control": "no-store" };
  try {
    if (!(await sessionUserId())) return NextResponse.json({ count: 0 }, { headers });
    const room = await getRoomByCode(code);
    if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const since = room.state.matchStartedAt;
    if (!since) return NextResponse.json({ count: 0 }, { headers });
    const count = await countCollectedSince(code, since);
    return NextResponse.json({ count }, { headers });
  } catch (err) {
    console.error("[GET /api/rooms/[code]/collected]", err);
    return NextResponse.json({ error: "Failed to count" }, { status: 500 });
  }
}
