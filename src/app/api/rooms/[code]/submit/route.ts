import { NextResponse, after } from "next/server";
import { isValidCode, submitWinningWord } from "@/lib/rooms";
import { broadcastRoomState } from "@/lib/realtime";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ code: string }> };

type Definition = {
  partOfSpeech: string;
  definition: string;
  example?: string;
};

/**
 * Submit the round's winning word. Either player can call this; the role is
 * resolved server-side. First valid submission wins — the optimistic-
 * concurrency gate (`phase = 'race' AND result IS NULL`) makes subsequent
 * submissions a no-op that bails with 409 already_decided.
 *
 * Validation against the dictionary still happens client-side via
 * /api/words/validate so the result.phonetic / audio / definitions are
 * passed in here rather than re-fetched server-side.
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
    const result = await submitWinningWord({
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
