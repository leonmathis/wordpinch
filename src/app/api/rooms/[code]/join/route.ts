import { NextResponse, after } from "next/server";
import { claimGuestSlot, isValidCode } from "@/lib/rooms";
import { broadcastRoomState } from "@/lib/realtime";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ code: string }> };

/**
 * Atomically claim the guest slot. Idempotent — if the caller already owns
 * the host or guest slot they get their role back without side effects.
 *
 * Body: { clientId: string, name?: string }
 * Response (200): { role: 'host' | 'guest' }
 * Response (403): { error: 'spectator' } when the guest slot is taken by
 *   someone else (3rd+ tab on the room URL).
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

  const { clientId, name } =
    body && typeof body === "object"
      ? (body as { clientId?: unknown; name?: unknown })
      : ({} as { clientId?: unknown; name?: unknown });

  if (typeof clientId !== "string" || !UUID_REGEX.test(clientId)) {
    return NextResponse.json(
      { error: "clientId must be a UUID v4 string" },
      { status: 400 }
    );
  }
  const safeName =
    typeof name === "string" && name.length > 0 && name.length <= 32
      ? name
      : undefined;

  try {
    const result = await claimGuestSlot({ code, clientId, name: safeName });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }
      // Occupied → caller becomes a spectator.
      return NextResponse.json(
        { error: "spectator", role: "spectator" },
        { status: 403 }
      );
    }
    // Re-broadcast so the host's lobby sees the guest name appear without a
    // page refresh. Same pattern as /state: deferred via `after()` for
    // serverless reliability.
    if (result.role === "guest") {
      after(async () => {
        await broadcastRoomState(code, result.state);
      });
    }
    return NextResponse.json(
      { role: result.role },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/rooms/[code]/join]", err);
    return NextResponse.json(
      { error: "Failed to join room" },
      { status: 500 }
    );
  }
}
