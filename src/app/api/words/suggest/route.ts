import { NextResponse } from "next/server";
import { getWordlist } from "@/lib/words/wordlist";

const LETTER_REGEX = /^[a-z]$/i;
const MAX_SUGGESTIONS = 8;

/**
 * Returns words from the ENABLE wordlist that match a (start, end, minLength)
 * constraint. Used by ResultPhase when the round times out — gives the
 * players a few examples of what they could have played.
 *
 * GET /api/words/suggest?start=T&end=H&min=3
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = (url.searchParams.get("start") ?? "").toLowerCase();
  const end = (url.searchParams.get("end") ?? "").toLowerCase();
  const minRaw = url.searchParams.get("min") ?? "3";
  const min = Math.max(2, Math.min(15, Number.parseInt(minRaw, 10) || 3));

  if (!LETTER_REGEX.test(start) || !LETTER_REGEX.test(end)) {
    return NextResponse.json(
      { error: "start and end must each be a single letter" },
      { status: 400 }
    );
  }

  try {
    const set = await getWordlist();
    // Iterate the Set once; cheap because we early-exit at MAX_SUGGESTIONS.
    // Prefer shorter / more common-looking words by length bias.
    const matches: string[] = [];
    for (const w of set) {
      if (w.length < min) continue;
      if (w[0] !== start) continue;
      if (w[w.length - 1] !== end) continue;
      matches.push(w);
      if (matches.length >= MAX_SUGGESTIONS * 4) break; // gather then trim
    }
    matches.sort((a, b) => a.length - b.length || a.localeCompare(b));
    const suggestions = matches.slice(0, MAX_SUGGESTIONS);
    return NextResponse.json(
      { start, end, min, suggestions },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=86400" },
      }
    );
  } catch (err) {
    console.error("[GET /api/words/suggest]", err);
    return NextResponse.json(
      { error: "Failed to load wordlist" },
      { status: 500 }
    );
  }
}
