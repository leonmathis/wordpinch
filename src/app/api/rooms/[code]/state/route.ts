import { NextResponse, after } from "next/server";
import { isValidCode, updateRoomState } from "@/lib/rooms";
import { persistedGameStateSchema } from "@/lib/game/state-schema";
import { broadcastRoomState } from "@/lib/realtime-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const { hostId, state } = body as { hostId?: unknown; state?: unknown };

  if (typeof hostId !== "string" || !UUID_REGEX.test(hostId)) {
    return NextResponse.json(
      { error: "hostId must be a UUID v4 string" },
      { status: 400 }
    );
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
    const ok = await updateRoomState({
      code,
      hostId,
      state: validated,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Room not found or hostId mismatch" },
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
      await broadcastRoomState(code, validated);
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
