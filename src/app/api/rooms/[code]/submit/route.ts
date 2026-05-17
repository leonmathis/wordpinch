import { NextResponse, after } from "next/server";
import { isValidCode, recordAttempt, resolveRound } from "@/lib/rooms";
import { broadcastRoomState } from "@/lib/realtime";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tie-detection window: time the first submitter's resolver waits before
 * computing the round outcome. Long enough to catch a genuinely-tied second
 * submission, short enough that there's no noticeable round-end lag.
 */
const TIE_WINDOW_MS = 200;

type Params = { params: Promise<{ code: string }> };

type Definition = {
  partOfSpeech: string;
  definition: string;
  example?: string;
};

/**
 * Submit a word during the race. Either player can call this; the server
 * resolves role from clientId.
 *
 * Flow:
 *  1. `recordAttempt` either claims `pendingResult` (we're the first
 *     submitter) or appends to it (we're the second within the tie window).
 *  2. If we're first, an `after()` callback sleeps `TIE_WINDOW_MS` and then
 *     calls `resolveRound`, which reads whatever's accumulated and writes
 *     the final state per `settings.tieBehavior`.
 *  3. The broadcast of the final state happens at the end of the resolve
 *     callback. Second submitters await that broadcast for the result.
 *
 * 409 responses (`too_late` / `already_decided`) are expected and handled
 * benignly by the client — their state will catch up on the broadcast.
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

  const { clientId, word, phonetic, audio, definitions } =
    body && typeof body === "object"
      ? (body as {
          clientId?: unknown;
          word?: unknown;
          phonetic?: unknown;
          audio?: unknown;
          definitions?: unknown;
        })
      : ({} as Record<string, unknown>);

  if (typeof clientId !== "string" || !UUID_REGEX.test(clientId)) {
    return NextResponse.json(
      { error: "clientId must be a UUID v4 string" },
      { status: 400 }
    );
  }
  if (typeof word !== "string" || word.length === 0 || word.length > 50) {
    return NextResponse.json(
      { error: "word must be a non-empty string up to 50 chars" },
      { status: 400 }
    );
  }

  const safePhonetic = typeof phonetic === "string" ? phonetic : undefined;
  const safeAudio = typeof audio === "string" ? audio : undefined;
  const safeDefinitions = Array.isArray(definitions)
    ? (definitions as Definition[]).filter(
        (d): d is Definition =>
          !!d &&
          typeof d.partOfSpeech === "string" &&
          typeof d.definition === "string"
      )
    : undefined;

  try {
    const result = await recordAttempt({
      code,
      clientId,
      word,
      phonetic: safePhonetic,
      audio: safeAudio,
      definitions: safeDefinitions,
    });
    if (!result.ok) {
      const status =
        result.reason === "not_found"
          ? 404
          : result.reason === "forbidden"
          ? 403
          : 409;
      return NextResponse.json({ error: result.reason }, { status });
    }
    if (result.isFirst) {
      // Schedule the tie-window resolver. Using `after()` keeps the function
      // alive past the response (Vercel honors this), so the 200ms sleep
      // doesn't delay the client. The second submitter's request will land
      // inside this window if it's a real tie.
      after(async () => {
        await new Promise((r) => setTimeout(r, TIE_WINDOW_MS));
        const resolved = await resolveRound({ code });
        if (resolved) {
          await broadcastRoomState(code, resolved.state);
        }
      });
    }
    // Either way, broadcast the *current* state so the other client's UI
    // can show "submitted" feedback before the resolution lands. Cheap and
    // helps with reactivity.
    after(async () => {
      await broadcastRoomState(code, result.state);
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/rooms/[code]/submit]", err);
    return NextResponse.json(
      { error: "Failed to submit word" },
      { status: 500 }
    );
  }
}
