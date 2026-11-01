import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { dailyStatus } from "@/lib/daily";
import { sessionUserId } from "@/lib/supabase/identity";
import { DailyCard, dailyCardData } from "@/lib/og/daily-card";
import { cardFonts } from "@/lib/og/fonts";
import { PORTRAIT } from "@/lib/og/match-card";
import { siteOrigin } from "@/lib/og/render";

/**
 * F6 "Share my pinch": the caller's daily card as a 1080×1350 PNG, once
 * they have finished today. `?download=1` saves it. Not cached.
 */
export async function GET(request: Request) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const d = dailyCardData(await dailyStatus(userId), await siteOrigin());
  if (!d) return NextResponse.json({ error: "not_done" }, { status: 404 });
  const fonts = await cardFonts(d.text);
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new ImageResponse(<DailyCard d={d} />, {
    ...PORTRAIT,
    ...(fonts.length ? { fonts } : {}),
    headers: {
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": `attachment; filename="wordpinch-daily-${d.number}.png"` } : {}),
    },
  });
}
