import { NextResponse } from "next/server";
import { isValidCode, updateRoomState } from "@/lib/rooms";
import type { PersistedGameState } from "@/lib/game/state";
import { broadcastRoomState } from "@/lib/realtime";

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
  if (!state || typeof state !== "object") {
    return NextResponse.json(
      { error: "state must be an object" },
      { status: 400 }
    );
  }

  try {
    const ok = await updateRoomState({
      code,
      hostId,
      state: state as PersistedGameState,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Room not found or hostId mismatch" },
        { status: 403 }
      );
    }
    // Fire-and-forget broadcast — DB write is the source of truth, missed
    // broadcasts are recovered on the next page load / reconnect.
    void broadcastRoomState(code, state as PersistedGameState);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/rooms/[code]/state]", err);
    return NextResponse.json(
      { error: "Failed to update room state" },
      { status: 500 }
    );
  }
}
