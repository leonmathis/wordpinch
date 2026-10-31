import { NextResponse } from "next/server";
import { getRoomByCode, isValidCode } from "@/lib/rooms";
import { collectWord } from "@/lib/collection";
import { sessionUserId } from "@/lib/supabase/identity";

type Params = { params: Promise<{ code: string }> };

/**
 * Bookmarks the word on the round result screen into the caller's
 * collection (F2). The word and its meaning come from the room, never from
 * the body; the body only names the round, so a tap that lands after the
 * room moved on saves nothing instead of the next round's word.
 *
 * Body: { round: number }
 * Response (200): { saved: true, source: "won" | "saved" }
 * 401 without a session (legacy clientId players have no collection),
 * 403 for spectators, 409 when that round's result is no longer showing.
 */
export async function POST(request: Request, { params }: Params) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  if (!isValidCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const round = body && typeof body === "object" ? (body as { round?: unknown }).round : undefined;
  if (typeof round !== "number" || !Number.isInteger(round)) {
    return NextResponse.json({ error: "round must be an integer" }, { status: 400 });
  }

  const userId = await sessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const room = await getRoomByCode(code);
    if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const side = room.host_id === userId ? "host" : room.guest_id === userId ? "guest" : null;
    if (!side) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const { state } = room;
    const result = state.result;
    const winner = result?.winner;
    if (
      state.phase !== "result" ||
      state.round !== round ||
      !result?.word ||
      (winner !== "host" && winner !== "guest")
    ) {
      return NextResponse.json({ error: "not_showing" }, { status: 409 });
    }

    const iWon = winner === side;
    const winnerName = (winner === "host" ? state.players.host : state.players.guest)?.name ?? null;
    const otherName = (side === "host" ? state.players.guest : state.players.host)?.name ?? null;
    await collectWord({
      userId,
      word: result.word,
      definitions: result.definitions,
      // The resolver already stored the winner's own word as a win; this
      // only fills it in if that write failed.
      source: iWon ? "won" : "saved",
      opponent: iWon ? otherName : winnerName,
      timeMs:
        iWon && state.raceStartedAt && result.submittedAt
          ? Math.max(0, result.submittedAt - state.raceStartedAt)
          : undefined,
      roomCode: code,
    });
    return NextResponse.json(
      { saved: true, source: iWon ? "won" : "saved" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/rooms/[code]/save-word]", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
