import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAccountId, isUuid, sessionUserId } from "@/lib/supabase/identity";

/**
 * Moves the room seats of a browser's pre-F1 clientId onto its anonymous
 * account (`adopt_client_seats`), so a game in progress survives the
 * switch to accounts.
 *
 * Body: { clientId: string }
 * Response (200): { moved: number }
 * 401 without a session; 403 when clientId is an account id (adopting it
 * would hand that account's seats to the caller).
 */
export async function POST(request: Request) {
  const userId = await sessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const clientId =
    body && typeof body === "object" && "clientId" in body
      ? (body as { clientId: unknown }).clientId
      : null;
  if (!isUuid(clientId)) {
    return NextResponse.json({ error: "clientId must be a UUID" }, { status: 400 });
  }
  if (clientId === userId) {
    return NextResponse.json({ moved: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    if (await isAccountId(clientId)) {
      return NextResponse.json({ error: "Not a client id" }, { status: 403 });
    }
    const { data, error } = await supabaseAdmin().rpc("adopt_client_seats", {
      p_client_id: clientId,
      p_user_id: userId,
    });
    if (error) throw error;
    return NextResponse.json(
      { moved: typeof data === "number" ? data : 0 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/identity/adopt]", err);
    return NextResponse.json({ error: "Failed to adopt seats" }, { status: 500 });
  }
}
