import "server-only";
import { supabaseAdmin } from "./admin";
import { supabaseServer } from "./server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Account id from the caller's session cookie, verified with getClaims()
 * (the JWT signature is checked; the cookie alone is never trusted).
 * Refreshed tokens are written back through the route handler's cookies.
 */
export async function sessionUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const sub = data.claims.sub;
  return isUuid(sub) ? sub : null;
}

/**
 * True when `id` belongs to an auth account. An account id only counts
 * with that account's session, so it is refused as a legacy clientId:
 * otherwise anyone who learned a player's account id could send it in a
 * body without a cookie and take their seat.
 */
export async function isAccountId(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().auth.admin.getUserById(id);
  if (data?.user) return true;
  if (error && error.status !== 404) throw error;
  return false;
}

/**
 * Who is calling a room route. The session's account id when signed in
 * (any id in the body is ignored); otherwise the legacy clientId from the
 * body, for browsers whose anonymous sign-in failed. Null when neither
 * identifies the caller.
 */
export async function resolveCallerId(claimed: unknown): Promise<string | null> {
  const userId = await sessionUserId();
  if (userId) return userId;
  if (!isUuid(claimed)) return null;
  if (await isAccountId(claimed)) return null;
  return claimed;
}
