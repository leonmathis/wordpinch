-- revoke_rpc_grants
--
-- The previous migration revoked EXECUTE on the dual-auth RPCs from
-- `public`, but PostgREST exposes anything callable by the `anon` and
-- `authenticated` roles via /rest/v1/rpc/<name>. Those two roles hold
-- their own EXECUTE grants (inherited via the default function grants),
-- which the `from public` revoke does not strip — so the advisor flagged
-- both functions as externally callable.
--
-- Belt-and-braces revoke from anon + authenticated. Service role (and the
-- secret-key admin client) is unaffected; the Next.js route handlers
-- continue to call these via supabase.rpc() with the secret key.

revoke execute on function public.claim_guest_slot(text, text, text) from anon, authenticated;
revoke execute on function public.rename_player(text, text, text) from anon, authenticated;
