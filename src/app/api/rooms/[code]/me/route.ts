import { NextResponse } from "next/server";
import { getRoomByCode, isValidCode } from "@/lib/rooms";
import { resolveCallerId } from "@/lib/supabase/identity";


type Params = { params: Promise<{ code: string }> };

/**
 * Resolve the caller's role for this room without leaking the host or guest
 * UUIDs. Used by the client on room mount to decide whether to call
 * /join (unclaimed slot) and which credential to send for mutations.
 *
 * Caller: the session's account id, or the legacy `clientId` in the body
 * when the browser has no session (`resolveCallerId`).
 * Response:
 *   { role: 'host' | 'guest' | 'guest_unclaimed' | 'spectator' }
 *
 * - host:           caller's id matches rooms.host_id
 * - guest:          caller's id matches rooms.guest_id
 * - guest_unclaimed: nobody owns the guest slot yet; caller should POST /join
 * - spectator:      guest slot is held by someone else
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

  const clientId =
    body && typeof body === "object" && "clientId" in body
      ? (body as { clientId: unknown }).clientId
      : null;

  const callerId = await resolveCallerId(clientId);
  if (!callerId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const room = await getRoomByCode(code);
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    const role: "host" | "guest" | "guest_unclaimed" | "spectator" =
      room.host_id === callerId
        ? "host"
        : room.guest_id === callerId
        ? "guest"
        : room.guest_id === null
        ? "guest_unclaimed"
        : "spectator";
    return NextResponse.json(
      { role },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/rooms/[code]/me]", err);
    return NextResponse.json(
      { error: "Failed to resolve role" },
      { status: 500 }
    );
  }
}
