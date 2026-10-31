import { NextResponse, after } from "next/server";
import { isValidCode, lockPlayerLetter } from "@/lib/rooms";
import { broadcastRoomState } from "@/lib/realtime-server";
import { resolveCallerId } from "@/lib/supabase/identity";

const LETTER_REGEX = /^[A-Za-z]$/;

type Params = { params: Promise<{ code: string }> };

/**
 * Either player locks their own letter for the current round. The role is
 * resolved server-side from clientId vs rooms.host_id / rooms.guest_id —
 * the client never tells us "I'm host". When both letters are set after
 * this call the phase transitions to 'reveal' in the same write.
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

  const { clientId, letter } =
    body && typeof body === "object"
      ? (body as { clientId?: unknown; letter?: unknown })
      : ({} as { clientId?: unknown; letter?: unknown });

  const callerId = await resolveCallerId(clientId);
  if (!callerId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (typeof letter !== "string" || !LETTER_REGEX.test(letter)) {
    return NextResponse.json(
      { error: "letter must be a single A-Z character" },
      { status: 400 }
    );
  }

  try {
    const result = await lockPlayerLetter({ code, clientId: callerId, letter });
    if (!result.ok) {
      const status =
        result.reason === "not_found"
          ? 404
          : result.reason === "forbidden"
          ? 403
          : 409;
      return NextResponse.json({ error: result.reason }, { status });
    }
    after(async () => {
      await broadcastRoomState(code, result.state);
    });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/rooms/[code]/lock-letter]", err);
    return NextResponse.json(
      { error: "Failed to lock letter" },
      { status: 500 }
    );
  }
}
