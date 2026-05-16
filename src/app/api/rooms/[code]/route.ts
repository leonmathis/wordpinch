import { NextResponse } from "next/server";
import { getRoomByCode, isValidCode } from "@/lib/rooms";

type Params = { params: Promise<{ code: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();

  if (!isValidCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  try {
    const room = await getRoomByCode(code);
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    return NextResponse.json(
      { code, state: room.state, language: room.language },
      {
        status: 200,
        headers: {
          // Don't cache room state — it changes per request.
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[GET /api/rooms/[code]]", err);
    return NextResponse.json(
      { error: "Failed to load room" },
      { status: 500 }
    );
  }
}
