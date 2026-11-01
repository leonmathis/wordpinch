import { NextResponse } from "next/server";
import { fairPairs } from "@/lib/words/pairs";

/**
 * F8 pass the phone: a random letter pair with enough valid words.
 * GET /api/words/pair?min=4&not=TH,SO → { start: "Q", end: "N" }
 * `not` skips pairs already played this match.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const min = Math.max(3, Math.min(8, Number.parseInt(url.searchParams.get("min") ?? "4", 10) || 4));
  const skip = new Set((url.searchParams.get("not") ?? "").toUpperCase().split(",").filter((p) => /^[A-Z]{2}$/.test(p)));
  try {
    const fair = await fairPairs(min);
    const open = fair.filter((p) => !skip.has(p));
    const pool = open.length ? open : fair;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return NextResponse.json({ start: pick[0], end: pick[1] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[GET /api/words/pair]", err);
    return NextResponse.json({ error: "Failed to pick letters" }, { status: 500 });
  }
}
