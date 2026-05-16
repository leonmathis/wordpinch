import { NextResponse } from "next/server";
import { createRoom } from "@/lib/rooms";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  if (typeof hostId !== "string" || !UUID_REGEX.test(hostId)) {
    return NextResponse.json(
      { error: "hostId must be a UUID v4 string" },
      { status: 400 }
    );
  }
  const safeName =
    typeof hostName === "string" && hostName.length > 0 && hostName.length <= 32
      ? hostName
      : undefined;

  try {
    const { code } = await createRoom({ hostId, hostName: safeName });
    return NextResponse.json({ code }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/rooms]", err);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 }
    );
  }
}
