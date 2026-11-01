import { NextResponse, after } from "next/server";
import { isValidCode, updateRoomState } from "@/lib/rooms";
import { persistedGameStateSchema } from "@/lib/game/state-schema";
import { broadcastRoomState } from "@/lib/realtime-server";
import { resolveCallerId } from "@/lib/supabase/identity";


type Params = { params: Promise<{ code: string }> };

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

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  // `actorId` is either seated player: the guest becomes the acting referee
  // when the host's client disappears mid-match. `hostId` is still accepted
  // so a client mid-deploy (old bundle, new server) keeps working.
  const { actorId, hostId, state } = body as {
    actorId?: unknown;
    hostId?: unknown;
    state?: unknown;
  };
  const actor = typeof actorId === "string" ? actorId : hostId;

  const callerId = await resolveCallerId(actor);
  if (!callerId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  // Strict schema validation: a malformed state payload would otherwise
  // overwrite the row's jsonb and wedge the room into a shape the client
  // code can't render. A well-behaved client never trips this; the check
  // exists for defence in depth (and to surface schema drift early in
  // development).
  const parsed = persistedGameStateSchema.safeParse(state);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid state payload",
        issues: parsed.error.issues.slice(0, 10),
      },
      { status: 400 }
    );
  }
  const validated = parsed.data;

  try {
    const written = await updateRoomState({
      code,
      actorId: callerId,
      state: validated,
    });
    if (!written) {
      return NextResponse.json(
        { error: "Room not found, or you don't hold a player slot in it" },
        { status: 403 }
      );
    }
    // Schedule the broadcast to run AFTER the response is sent. Using
    // next/server's `after()` (instead of fire-and-forget `void`) is the
    // server-after-nonblocking pattern: serverless guarantees the work
    // completes even if the request handler has already returned. Missed
    // broadcasts are recovered on next page load / reconnect, but `after`
    // is markedly more reliable than naked `void`.
    after(async () => {
      await broadcastRoomState(code, written);
    });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/rooms/[code]/state]", err);
    return NextResponse.json(
      { error: "Failed to update room state" },
      { status: 500 }
    );
  }
}
