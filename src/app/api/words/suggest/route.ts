import { NextResponse } from "next/server";
import { getWordlist } from "@/lib/words/wordlist";

const LETTER_REGEX = /^[a-z]$/i;
const MAX_SUGGESTIONS = 8;
const MAX_AT_MIN_LENGTH = 6;
const MAX_LONGER = 2;

/**
 * Returns words from the ENABLE wordlist that match a (start, end, minLength)
 * constraint. Used by ResultPhase when the round times out — gives the
 * players a few examples of what they could have played.
 *
 * GET /api/words/suggest?start=T&end=H&min=3
 *
 * Selection strategy:
 *  - Prefer words exactly at `min` length (the constraint the players were
 *    actually trying to beat) — up to MAX_AT_MIN_LENGTH.
 *  - Top up with 1–2 longer words (min+1, then min+2, …) for flavour and to
 *    show what's possible if they'd had more time.
 *  - If nothing exists at exactly `min`, fall back to the shortest available
 *    length so the player still gets a concrete example.
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
    // Bucket matches by length so we can mix "at-min" and "longer" entries.
    const byLength = new Map<number, string[]>();
    for (const w of set) {
      if (w.length < min) continue;
      if (w[0] !== start) continue;
      if (w[w.length - 1] !== end) continue;
      const bucket = byLength.get(w.length) ?? [];
      bucket.push(w);
      byLength.set(w.length, bucket);
    }

    if (byLength.size === 0) {
      return NextResponse.json(
        { start, end, min, suggestions: [] },
        { status: 200, headers: { "Cache-Control": "public, max-age=86400" } }
      );
    }

    // Alphabetize within each bucket so the response is deterministic
    // (better cache key, no random feel for the player).
    for (const bucket of byLength.values()) bucket.sort();

    const suggestions: string[] = [];
    const atMin = byLength.get(min);

    if (atMin && atMin.length > 0) {
      suggestions.push(...atMin.slice(0, MAX_AT_MIN_LENGTH));

      // Top up with 1–2 longer entries from the next available lengths.
      const longerLengths = [...byLength.keys()]
        .filter((l) => l > min)
        .sort((a, b) => a - b);
      for (const len of longerLengths) {
        if (suggestions.length >= MAX_SUGGESTIONS) break;
        const bucket = byLength.get(len) ?? [];
        const room = Math.min(
          MAX_LONGER - (suggestions.length - atMin.slice(0, MAX_AT_MIN_LENGTH).length),
          MAX_SUGGESTIONS - suggestions.length,
          bucket.length
        );
        if (room > 0) suggestions.push(...bucket.slice(0, room));
      }
    } else {
      // No words at the exact minimum — fall back to the shortest available
      // length so the player still sees a concrete example.
      const shortestLen = Math.min(...byLength.keys());
      const bucket = byLength.get(shortestLen) ?? [];
      suggestions.push(...bucket.slice(0, MAX_SUGGESTIONS));
    }

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
