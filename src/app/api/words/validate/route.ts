import { NextResponse } from "next/server";
import { validateWord } from "@/lib/words/validate";

// Conservative bounds. Anything longer than 30 is almost certainly noise;
// anything below 2 has no semantic value.
const WORD_REGEX = /^[a-z]{2,30}$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const rawWord = obj && "word" in obj ? obj.word : null;
  const allowProperNouns =
    obj && "allowProperNouns" in obj && typeof obj.allowProperNouns === "boolean"
      ? obj.allowProperNouns
      : true;

  if (typeof rawWord !== "string") {
    return NextResponse.json(
      { error: "word must be a string" },
      { status: 400 }
    );
  }

  const word = rawWord.trim().toLowerCase();
  if (!WORD_REGEX.test(word)) {
    // Not even a candidate — short-circuit without spending an API call or
    // wordlist lookup.
    return NextResponse.json(
      { valid: false, word, source: "rejected" },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=86400" },
      }
    );
  }

  try {
    const result = await validateWord(word, { allowProperNouns });
    return NextResponse.json(result, {
      status: 200,
      // Validation results are stable per (word, lang, allowProperNouns); a
      // long cache is safe. Vary on the option for correctness.
      headers: {
        "Cache-Control": "public, max-age=86400",
        Vary: "Accept-Encoding",
      },
    });
  } catch (err) {
    console.error("[POST /api/words/validate]", err);
    return NextResponse.json(
      { error: "Validation failed" },
      { status: 500 }
    );
  }
}
