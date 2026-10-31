import { NextResponse, after } from "next/server";
import { isValidCode, peekLetter } from "@/lib/rooms";
import { broadcastRoomState } from "@/lib/realtime-server";
import { resolveCallerId } from "@/lib/supabase/identity";

type Params = { params: Promise<{ code: string }> };

/**
 * F4 peek: the caller's one hint per match, during the race. Returns the
 * second letter of a valid word for this round; asking again in the same
 * round returns the same letter without using anything.
 *
 * Body: { clientId?: string }
 * Response (200): { letter: "O" }
 * 409 `used` (spent in an earlier round), `off` (rule not on), `wrong_phase`;
 * 404 `no_word` when nothing fits (the peek is not used up).
 */
export async function POST(request: Request, { params }: Params) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  if (!isValidCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* an empty body is fine with a session */
  }
  const clientId = body && typeof body === "object" ? (body as { clientId?: unknown }).clientId : undefined;
  const callerId = await resolveCallerId(clientId);
  if (!callerId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const result = await peekLetter({ code, clientId: callerId });
    if (!result.ok) {
      const status =
        result.reason === "not_found" || result.reason === "no_word" ? 404 : result.reason === "forbidden" ? 403 : 409;
      return NextResponse.json({ error: result.reason }, { status });
    }
    // Others only learn that the peek is spent, never the letter.
    if (result.fresh) {
      after(async () => {
        await broadcastRoomState(code, result.state);
      });
    }
    return NextResponse.json({ letter: result.letter }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[POST /api/rooms/[code]/peek]", err);
    return NextResponse.json({ error: "Failed to peek" }, { status: 500 });
  }
}
