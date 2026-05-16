import { NextResponse } from "next/server";
import { getRoomByCode, isValidCode } from "@/lib/rooms";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ code: string }> };

/**
 * Resolve the caller's role for this room without leaking the host's UUID.
 *
 * Body: { clientId: string }
 * Response: { role: 'host' | 'guest' }
 *
 * Phase 4: we only distinguish host vs guest. Spectator (3rd+ tab) is
 * resolved client-side via presence ordering once it lands.
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

  if (typeof clientId !== "string" || !UUID_REGEX.test(clientId)) {
    return NextResponse.json(
      { error: "clientId must be a UUID" },
      { status: 400 }
    );
  }

  try {
    const room = await getRoomByCode(code);
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    const role: "host" | "guest" = room.host_id === clientId ? "host" : "guest";
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
