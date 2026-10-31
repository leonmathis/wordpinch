import { NextResponse } from "next/server";
import { createRoom } from "@/lib/rooms";
import { resolveCallerId } from "@/lib/supabase/identity";


export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hostId =
    body && typeof body === "object" && "hostId" in body
      ? (body as { hostId: unknown }).hostId
      : null;
  const hostName =
    body && typeof body === "object" && "hostName" in body
      ? (body as { hostName: unknown }).hostName
      : undefined;

  const callerId = await resolveCallerId(hostId);
  if (!callerId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const safeName =
    typeof hostName === "string" && hostName.length > 0 && hostName.length <= 32
      ? hostName
      : undefined;

  try {
    const { code } = await createRoom({ hostId: callerId, hostName: safeName });
    return NextResponse.json(
      { code },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/rooms]", err);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 }
    );
  }
}
