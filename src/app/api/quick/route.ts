import { NextResponse } from "next/server";
import { joinQuick, leaveQuick, quickStatus } from "@/lib/quick";
import { sessionUserId } from "@/lib/supabase/identity";

/**
 * F7 quick match for the caller (anonymous account, F1):
 *   GET    → { state: idle | waiting | matched, … } (polled while waiting)
 *   POST   → join the queue, or get paired at once. Body: { name?: string }
 *   DELETE → leave the queue (Cancel)
 */

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json(await quickStatus(userId), { headers });
  } catch (err) {
    console.error("[GET /api/quick]", err);
    return NextResponse.json({ error: "Failed to check the queue" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let name = "";
  try {
    const body = (await request.json()) as { name?: unknown };
    if (typeof body?.name === "string") name = body.name;
  } catch {
    /* no body */
  }
  try {
    return NextResponse.json(await joinQuick(userId, name), { headers });
  } catch (err) {
    console.error("[POST /api/quick]", err);
    return NextResponse.json({ error: "Failed to join the queue" }, { status: 500 });
  }
}

export async function DELETE() {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await leaveQuick(userId);
    return NextResponse.json({ state: "idle" }, { headers });
  } catch (err) {
    console.error("[DELETE /api/quick]", err);
    return NextResponse.json({ error: "Failed to leave the queue" }, { status: 500 });
  }
}
