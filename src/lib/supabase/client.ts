import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client backed by the publishable key.
 * Use in client components for read-only access (RLS blocks writes).
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
