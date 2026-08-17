import { NextResponse, after } from "next/server";
import { isValidCode, updateRoomSettings } from "@/lib/rooms";
import { settingsPatchSchema } from "@/lib/game/state-schema";
import { broadcastRoomState } from "@/lib/realtime-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ code: string }> };

/**
 * Host-only partial settings update.
 *
 * Body: { hostId: string, patch: Partial<settings> }
 *
 * The patch (not the whole state) is the payload, so two lobby controls
 * changed in quick succession can't overwrite each other — the merge runs
 * server-side against the current row instead of against the client's
 * possibly-stale broadcast snapshot.
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

  const { hostId, patch } =
    body && typeof body === "object"
      ? (body as { hostId?: unknown; patch?: unknown })
      : ({} as { hostId?: unknown; patch?: unknown });

  if (typeof hostId !== "string" || !UUID_REGEX.test(hostId)) {
    return NextResponse.json(
      { error: "hostId must be a UUID v4 string" },
      { status: 400 }
    );
  }

  const parsed = settingsPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings patch", issues: parsed.error.issues.slice(0, 10) },
      { status: 400 }
    );
  }
  // `.partial()` on a schema with a defaulted key still fills that key in on
  // parse, which would smuggle `lengthBonus: false` into every patch. Keep
  // only the keys the caller actually sent.
  const sentKeys = new Set(
    patch && typeof patch === "object" ? Object.keys(patch) : []
  );
  const cleanPatch = Object.fromEntries(
    Object.entries(parsed.data).filter(([k]) => sentKeys.has(k))
  );

  if (Object.keys(cleanPatch).length === 0) {
    return NextResponse.json({ error: "Empty settings patch" }, { status: 400 });
  }

  try {
    const result = await updateRoomSettings({ code, hostId, patch: cleanPatch });
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
      { ok: true, state: result.state },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/rooms/[code]/settings]", err);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
