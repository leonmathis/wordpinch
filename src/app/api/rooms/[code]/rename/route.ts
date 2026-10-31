import { NextResponse, after } from "next/server";
import { isValidCode, renamePlayer } from "@/lib/rooms";
import { broadcastRoomState } from "@/lib/realtime-server";
import { resolveCallerId } from "@/lib/supabase/identity";


type Params = { params: Promise<{ code: string }> };

/**
 * Either player renames their own slot. Server resolves which slot from
 * clientId vs host_id / guest_id — the client never tells us "I'm host".
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
      : ({} as Record<string, unknown>);

  const callerId = await resolveCallerId(clientId);
  if (!callerId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 32) {
    return NextResponse.json(
      { error: "name must be a non-empty string up to 32 chars" },
      { status: 400 }
    );
  }

  try {
    const result = await renamePlayer({ code, clientId: callerId, name });
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 403;
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
    console.error("[POST /api/rooms/[code]/rename]", err);
    return NextResponse.json(
      { error: "Failed to rename" },
      { status: 500 }
    );
  }
}
