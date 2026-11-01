import { NextResponse } from "next/server";
import { renderCard, roomCard } from "@/lib/og/render";

type Params = { params: Promise<{ code: string }> };

/**
 * F5: the room's share card as a 1080×1350 PNG, drawn on the server.
 * `?download=1` asks the browser to save it ("Save image"). Not cached:
 * the card follows the room's state.
 */
export async function GET(request: Request, { params }: Params) {
  const { code } = await params;
  const d = await roomCard(code);
  if (!d) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return renderCard(d, "portrait", {
    headers: {
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": `attachment; filename="wordpinch-${d.code}.png"` } : {}),
    },
  });
}
