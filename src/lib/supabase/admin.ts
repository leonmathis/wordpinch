import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Admin client backed by the SUPABASE_SECRET_KEY.
 * Bypasses RLS — use ONLY in trusted server code (Route Handlers, Server
 * Actions, scheduled jobs). The `server-only` import errors at build time
 * if this file is ever imported into a client component bundle.
 */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
