import { NextResponse, after } from "next/server";
import { getRoomByCode, isValidCode, recordAttempt, resolveRound } from "@/lib/rooms";
import { broadcastRoomState } from "@/lib/realtime-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tie-detection window: time the first submitter's resolver waits before
 * computing the round outcome. Empirically tuned: dictionary validation
 * (Free Dictionary API) is the slow step on the client, so two human
 * players who press Enter at the same instant typically have their
 * /submit calls arrive 200–400 ms apart even on good networks. 500 ms
 * catches the realistic tie window without making solo wins feel sluggish.
 */
const TIE_WINDOW_MS = 500;

/**
 * Once the resolver has decided a *solo* winner, delay broadcasting the
 * result by this much to absorb any late-arriving submission as a
 * near-miss. Without the hold, the winner's UI mounts the result phase
 * with the single-attempt snapshot, then flickers to the near-miss view
 * a couple hundred ms later when the loser's `/submit` broadcast lands.
 * With the hold, the deferred re-read picks up the near-miss before the
 * first broadcast goes out and both clients render the final view on
 * first mount. Solo wins (no near-miss) pay this delay as a cost.
 */
const NEAR_MISS_BROADCAST_DELAY_MS = 600;

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
        if (!resolved) return;
        // For a *solo* outcome (only one attempt landed in the tie
        // window), hold the broadcast briefly so any near-miss submit
        // that arrives in the next ~600 ms is appended before the
        // result screen mounts on the winner's client. Then re-read
        // and broadcast whatever's authoritative (solo OR near-miss).
        const isSoloWinner =
          resolved.state.phase === "result" &&
          !!resolved.state.result &&
          (resolved.state.result.winner === "host" ||
            resolved.state.result.winner === "guest") &&
          resolved.state.result.attempts?.length === 1;
        if (isSoloWinner) {
          await new Promise((r) =>
            setTimeout(r, NEAR_MISS_BROADCAST_DELAY_MS)
          );
          const fresh = await getRoomByCode(code);
          if (fresh) {
            await broadcastRoomState(code, fresh.state);
            return;
          }
        }
        await broadcastRoomState(code, resolved.state);
      });
    }
    // Either way, broadcast the *current* state so the other client's UI
    // can show "submitted" feedback before the resolution lands. Cheap and
    // helps with reactivity.
    after(async () => {
      await broadcastRoomState(code, result.state);
    });
    // Return the state in the body so the submitter can apply it
    // synchronously and avoid racing the after() broadcast. That race
    // is what produced the "won-screen flash before near-miss view"
    // when the loser's submission landed during the near-miss window.
    return NextResponse.json(
      { ok: true, state: result.state },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/rooms/[code]/submit]", err);
    return NextResponse.json(
      { error: "Failed to submit word" },
      { status: 500 }
    );
  }
}
