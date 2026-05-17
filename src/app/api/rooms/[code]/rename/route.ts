import { NextResponse, after } from "next/server";
import { isValidCode, renamePlayer } from "@/lib/rooms";
import { broadcastRoomState } from "@/lib/realtime";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  if (typeof clientId !== "string" || !UUID_REGEX.test(clientId)) {
    return NextResponse.json(
      { error: "clientId must be a UUID v4 string" },
      { status: 400 }
    );
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 32) {
    return NextResponse.json(
      { error: "name must be a non-empty string up to 32 chars" },
      { status: 400 }
    );
  }

  try {
    const result = await renamePlayer({ code, clientId, name });
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 403;
      return NextResponse.json({ error: result.reason }, { status });
    }
    after(async () => {
      await broadcastRoomState(code, result.state);
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/rooms/[code]/rename]", err);
    return NextResponse.json(
      { error: "Failed to rename" },
      { status: 500 }
    );
  }
}
